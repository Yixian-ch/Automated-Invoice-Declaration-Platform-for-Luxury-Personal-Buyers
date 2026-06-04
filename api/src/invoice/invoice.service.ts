import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { InitiateUploadDto } from './dto/initiate-upload.dto.js';

export const OCR_QUEUE = 'ocr';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);
  private readonly bypassS3: boolean;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    @InjectQueue(OCR_QUEUE) private readonly ocrQueue: Queue,
  ) {
    this.bypassS3 =
      config.get<string>('NODE_ENV') !== 'production' &&
      config.get<string>('BYPASS_S3') === 'true';
    this.appUrl = config.get<string>('API_URL', 'http://localhost:3001');
  }

  /**
   * Step 1 — Create a PENDING_UPLOAD invoice record and return a presigned PUT URL.
   * The frontend uploads directly to S3 and then calls confirmUpload().
   */
  async initiateUpload(userId: string, dto: InitiateUploadDto) {
    const invoiceId = uuidv4();
    const s3Key = this.bypassS3
      ? `dev/bypass/${userId}/${invoiceId}`
      : this.storage.buildInvoiceKey(userId, invoiceId, dto.originalFilename);
    const bucket = this.bypassS3 ? 'dev-bypass' : this.storage.getBucketName();

    const presignedUrl = this.bypassS3
      ? `${this.appUrl}/api/v1/invoices/${invoiceId}/dev-sink`
      : await this.storage.getPresignedUploadUrl(s3Key, dto.mimeType);

    if (this.bypassS3) {
      this.logger.warn(`[DEV] BYPASS_S3: returning dev-sink URL for invoice ${invoiceId}`);
    }

    const invoice = await this.prisma.invoice.create({
      data: {
        id: invoiceId,
        userId,
        s3Key,
        s3Bucket: bucket,
        originalFilename: dto.originalFilename,
        mimeType: dto.mimeType,
        fileSizeBytes: dto.fileSizeBytes ? parseInt(dto.fileSizeBytes, 10) : null,
        status: 'PENDING_UPLOAD',
      },
    });

    return {
      invoiceId: invoice.id,
      presignedUrl,
      s3Key,
    };
  }

  /**
   * Step 2 — Client confirms the S3 upload is complete.
   * Transitions to UPLOADED and enqueues an OCR job.
   */
  async confirmUpload(userId: string, invoiceId: string) {
    const invoice = await this.findOwnInvoice(userId, invoiceId);

    if (invoice.status !== 'PENDING_UPLOAD') {
      throw new BadRequestException(
        `Invoice is already in status ${invoice.status}`,
      );
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'UPLOADED',
        uploadedAt: new Date(),
      },
    });

    // Enqueue OCR job
    await this.ocrQueue.add(
      'process-invoice',
      { invoiceId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: false,
      },
    );

    this.logger.log(`OCR job queued for invoice ${invoiceId}`);
    return updated;
  }

  /**
   * List invoices belonging to a user (most recent first).
   */
  async listByUser(userId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          status: true,
          originalFilename: true,
          mimeType: true,
          fileSizeBytes: true,
          invoiceNumber: true,
          purchaseDate: true,
          vendorName: true,
          brandName: true,
          currency: true,
          grandTotalAmount: true,
          cashbackAmount: true,
          ocrConfidence: true,
          uploadedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.invoice.count({ where: { userId } }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Get full invoice detail (owner or admin).
   */
  async getById(userId: string, invoiceId: string, isAdmin = false) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    if (!isAdmin && invoice.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    return invoice;
  }

  /**
   * Admin: list all invoices with optional status filter.
   */
  async adminList(status?: string, page = 1, limit = 50, userId?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};
    if (status) where.status = status;
    if (userId) where.userId = userId;

    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Admin: manually approve an invoice and calculate cashback.
   */
  async approve(adminId: string, invoiceId: string, note?: string) {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { user: true },
    });

    // Determine cashback rate: user-level override, then org-level, then 0
    const rate =
      invoice.user.cashbackRate ??
      (invoice.user.organizationId
        ? (
            await this.prisma.organization.findUnique({
              where: { id: invoice.user.organizationId },
            })
          )?.cashbackRate
        : null) ??
      0;

    const cashbackAmount =
      invoice.grandTotalAmount != null
        ? Number(invoice.grandTotalAmount) * Number(rate)
        : null;

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'APPROVED',
        cashbackAmount: cashbackAmount ?? undefined,
        reviewedAt: new Date(),
        reviewedById: adminId,
        reviewNote: note ?? null,
      },
    });
  }

  /**
   * Admin: reject an invoice.
   */
  async reject(adminId: string, invoiceId: string, note: string) {
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'REJECTED',
        reviewedAt: new Date(),
        reviewedById: adminId,
        reviewNote: note,
      },
    });
  }

  // ─── Helpers ───────────────────────────────

  private async findOwnInvoice(userId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    if (invoice.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return invoice;
  }
}
