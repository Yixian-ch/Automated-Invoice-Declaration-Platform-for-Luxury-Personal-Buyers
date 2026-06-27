import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import {
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3'; // no need for AWS
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

import { PrismaService } from '../prisma/prisma.service.js';
import { OcrService } from '../ocr/ocr.service.js';
import { CashbackService } from '../cashback/cashback.service.js';
import { OCR_QUEUE } from '../invoice/invoice.service.js';

interface OcrJobData {
  invoiceId: string;
}

@Processor(OCR_QUEUE)
export class OcrProcessor {
  private readonly logger = new Logger(OcrProcessor.name);
  private readonly s3: S3Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ocrService: OcrService,
    private readonly cashbackService: CashbackService,
    private readonly config: ConfigService,
  ) {
    this.s3 = new S3Client({
      region: this.config.get<string>('AWS_REGION', 'eu-west-3'),
      credentials: {
        accessKeyId: this.config.get<string>('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: this.config.get<string>('AWS_SECRET_ACCESS_KEY', ''),
      },
    });
  }

@Process('process-invoice')
async handleOcrJob(job: Job<OcrJobData>): Promise<void> {
  const { invoiceId } = job.data;
  this.logger.log(`Starting OCR for invoice ${invoiceId}`);
  this.logger.log(`[DEBUG] bypassS3=${this.config.get('BYPASS_S3')} bypassOcr=${this.config.get('BYPASS_OCR')}`);

  try {
    // 1. ✅ 移入 try 块内，确保任何 DB 错误都能被捕获并打印
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'OCR_PROCESSING' },
    });

    const bypassOcr =
      this.config.get<string>('NODE_ENV') !== 'production' &&
      this.config.get<string>('BYPASS_OCR') === 'true';

    // Fetch invoice record
    const invoice = await this.prisma.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
    });

    let buffer: Buffer;
    const bypassS3 = this.config.get<string>('BYPASS_S3') === 'true';

    if (bypassOcr) {
      this.logger.warn(`[DEV] BYPASS_OCR: skipping S3 download for invoice ${invoiceId}`);
      buffer = Buffer.from('');
    } else if (bypassS3) {
      const localPath = path.resolve(process.cwd(), 'uploads', invoiceId);
      this.logger.warn(`[DEV] BYPASS_S3: reading file from local path ${localPath}`);
      if (!fs.existsSync(localPath)) {
        throw new Error(`[DEV] Local file not found for invoice ${invoiceId} at ${localPath}`);
      }
      buffer = fs.readFileSync(localPath);
    } else {
      if (!invoice.s3Key || !invoice.s3Bucket) {
        throw new Error(`Invoice ${invoiceId} has no S3 key`);
      }
      const s3Response = await this.s3.send(
        new GetObjectCommand({ Bucket: invoice.s3Bucket, Key: invoice.s3Key }),
      );
      const chunks: Uint8Array[] = [];
      for await (const chunk of s3Response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      buffer = Buffer.concat(chunks);
    }

    // Run OCR
    const result = await this.ocrService.processDocument(
      buffer,
      invoice.mimeType ?? 'application/pdf',
    );

    // Calculate cashback from OCR-extracted data
    const cashbackResult = result.grandTotalAmount
      ? await this.cashbackService.calculate(
          result.vendorName ?? null,
          result.grandTotalAmount,
          result.taxRefundAmount ?? null,
          result.lineItems.map((li) => ({
            description: li.description,
            brand: li.brand ?? null,
            itemCategory: li.itemCategory ?? null,
            amount_ttc: li.amount_ttc ?? 0,
          })),
        )
      : null;

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: 'OCR_DONE',
        invoiceNumber: result.invoiceNumber,
        purchaseDate: result.purchaseDate,
        vendorName: result.vendorName,
        vendorAddress: result.vendorAddress,
        brandName: result.brandName,
        itemDescription: result.itemDescription,
        currency: this.mapCurrency(result.currency) as any,
        subtotalAmount: result.subtotalAmount,
        taxAmount: result.taxAmount,
        grandTotalAmount: result.grandTotalAmount,
        taxRefundAmount: result.taxRefundAmount ?? null,
        lineItems: result.lineItems as any,
        cashbackAmount: cashbackResult ? cashbackResult.totalCashback : undefined,
        cashbackBreakdown: cashbackResult ? (cashbackResult.breakdown as any) : undefined,
        ocrConfidence: result.confidence,
        ocrRawJson: result.rawJson as any,
        ocrCompletedAt: new Date(),
      },
    });

    this.logger.log(
      `OCR complete for invoice ${invoiceId} — confidence ${result.confidence.toFixed(2)}` +
        (cashbackResult ? ` — cashback ${cashbackResult.totalCashback.toFixed(2)}€` : ''),
    );
  } catch (err) {
    // 2. ✅ 现在这里能精准捕捉到刚才那个导致无限重试的罪魁祸首了
    this.logger.error(`OCR failed for invoice ${invoiceId}: ${String(err)}`);
    if (err instanceof Error) this.logger.error(err.stack);

    // 避免因为这里再次更新失败而冲掉原始错误日志
    try {
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: 'UPLOADED' }, 
      });
    } catch (dbErr) {
      this.logger.error(`Failed to reset invoice status to UPLOADED: ${String(dbErr)}`);
    }

    throw err;
  }
}
  @OnQueueFailed()
  onJobFailed(job: Job, error: Error) {
    this.logger.error(`[BULL ERROR] Job ${job.id} failed: ${error.message}`);
    this.logger.error(error.stack);
  }
  private mapCurrency(raw?: string): string | null {
    if (!raw) return null;
    const upper = raw.toUpperCase().trim();
    const valid = ['EUR', 'USD', 'GBP', 'CNY', 'JPY', 'CHF'];
    return valid.includes(upper) ? upper : null;
  }
}
