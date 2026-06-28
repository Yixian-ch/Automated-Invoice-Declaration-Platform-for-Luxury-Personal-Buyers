import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { CashbackService } from '../cashback/cashback.service.js';

export const OCR_QUEUE = 'ocr';

@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly cashback: CashbackService,
    @InjectQueue(OCR_QUEUE) private readonly ocrQueue: Queue,
  ) {}

  /**
   * Upload file + create DB record + queue OCR — all in one step.
   */
  async uploadAndEnqueue(
    userId: string,
    buffer: Buffer,
    mimeType: string,
    originalFilename: string,
    fileSizeBytes: number,
  ) {
    const invoiceId = uuidv4();

    this.storage.saveFile(invoiceId, buffer);

    const invoice = await this.prisma.invoice.create({
      data: {
        id: invoiceId,
        userId,
        originalFilename,
        mimeType,
        fileSizeBytes,
        s3Key: invoiceId,
        s3Bucket: 'local',
        status: 'PENDING',
        uploadedAt: new Date(),
      },
    });

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

    this.logger.log(`Invoice ${invoiceId} saved and queued for OCR`);
    return invoice;
  }

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

  async getById(userId: string, invoiceId: string, isAdmin = false) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });

    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!isAdmin && invoice.userId !== userId) throw new ForbiddenException('Access denied');

    return invoice;
  }

  async adminList(status?: string, page = 1, limit = 50, userId?: string) {
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = {};
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
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async approve(adminId: string, invoiceId: string, note?: string) {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });

    const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems as any[] : [];

    const cashbackResult =
      invoice.grandTotalAmount && invoice.vendorName
        ? await this.cashback.calculate(
            invoice.vendorName,
            Number(invoice.grandTotalAmount),
            invoice.taxRefundAmount != null ? Number(invoice.taxRefundAmount) : null,
            lineItems.map((li: any) => ({
              description: li.description,
              brand: li.brand ?? null,
              itemCategory: li.itemCategory ?? null,
              amount_ttc: li.amount_ttc ?? 0,
            })),
          )
        : null;

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'APPROVED',
        cashbackAmount: cashbackResult ? cashbackResult.totalCashback : undefined,
        cashbackBreakdown: cashbackResult ? (cashbackResult.breakdown as any) : undefined,
        reviewedAt: new Date(),
        reviewedById: adminId,
        reviewNote: note ?? null,
      },
    });
  }

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

  async correctInvoice(
    invoiceId: string,
    dto: { vendorName?: string; purchaseDate?: string; grandTotalAmount?: string },
  ) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const data: Record<string, unknown> = { needsReview: false };
    if (dto.vendorName !== undefined) data.vendorName = dto.vendorName;
    if (dto.purchaseDate !== undefined) data.purchaseDate = new Date(dto.purchaseDate);
    if (dto.grandTotalAmount !== undefined) data.grandTotalAmount = dto.grandTotalAmount;

    return this.prisma.invoice.update({ where: { id: invoiceId }, data });
  }

  async deleteInvoice(invoiceId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    this.storage.deleteFile(invoiceId);
    await this.prisma.invoice.delete({ where: { id: invoiceId } });
  }

  async getFileMeta(invoiceId: string) {
    return this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { mimeType: true },
    });
  }
}
