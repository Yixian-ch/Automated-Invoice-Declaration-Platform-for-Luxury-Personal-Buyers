import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import {
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

import { PrismaService } from '../prisma/prisma.service.js';
import { OcrService } from '../ocr/ocr.service.js';
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

    const bypassOcr =
      this.config.get<string>('NODE_ENV') !== 'production' &&
      this.config.get<string>('BYPASS_OCR') === 'true';

    try {
      // Fetch invoice record
      const invoice = await this.prisma.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
      });

      let buffer: Buffer;

      const bypassS3 =
        this.config.get<string>('NODE_ENV') !== 'production' &&
        this.config.get<string>('BYPASS_S3') === 'true';

      if (bypassOcr) {
        // Skip S3 download — OcrService will return mock data
        this.logger.warn(`[DEV] BYPASS_OCR: skipping S3 download for invoice ${invoiceId}`);
        buffer = Buffer.from('');
      } else if (bypassS3) {
        // BYPASS_S3=true, BYPASS_OCR=false: read from local uploads dir (written by dev-sink)
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
        // Download from S3
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

      // Status stays PENDING — OCR only fills in field data.
      // needsReview=true is recorded in reviewReasons for the admin UI; no status change.
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          purchaseDate: result.purchaseDate,
          vendorName: result.vendorName ?? result.merchantName,
          brandName: result.brandName,
          currency: this.mapCurrency(result.currency) as any,
          grandTotalAmount: result.grandTotalAmount,
          ocrConfidence: result.confidence,
          ocrRawJson: result.rawJson as any,
          ocrCompletedAt: new Date(),
          lineItems: result.lineItems.length > 0 ? (result.lineItems as any) : undefined,
          arithmeticCheck: result.arithmeticCheck ?? undefined,
          needsReview: result.needsReview,
          reviewReasons: result.reviewReasons,
        },
      });

      this.logger.log(
        `OCR complete for invoice ${invoiceId} — needsReview=${result.needsReview} confidence=${result.confidence.toFixed(2)}`,
      );
    } catch (err) {
      this.logger.error(`OCR failed for invoice ${invoiceId}`, err);

      // Re-throw so Bull marks the job as failed and retries (status stays PENDING)
      throw err;
    }
  }

  private mapCurrency(raw?: string): string | null {
    if (!raw) return null;
    const upper = raw.toUpperCase().trim();
    const valid = ['EUR', 'USD', 'GBP', 'CNY', 'JPY', 'CHF'];
    return valid.includes(upper) ? upper : null;
  }
}
