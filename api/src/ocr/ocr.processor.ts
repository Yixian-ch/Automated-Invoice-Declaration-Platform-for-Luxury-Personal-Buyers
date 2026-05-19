import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import {
  S3Client,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { OcrService } from '../ocr/ocr.service';
import { OCR_QUEUE } from '../invoice/invoice.service';

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

    // Mark as processing
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { status: 'OCR_PROCESSING' },
    });

    try {
      // Fetch invoice record
      const invoice = await this.prisma.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
      });

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
      const buffer = Buffer.concat(chunks);

      // Run OCR
      const result = await this.ocrService.processDocument(
        buffer,
        invoice.mimeType ?? 'application/pdf',
      );

      // Persist extracted fields
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
          ocrConfidence: result.confidence,
          ocrRawJson: result.rawJson as any,
          ocrCompletedAt: new Date(),
        },
      });

      this.logger.log(
        `OCR complete for invoice ${invoiceId} — confidence ${result.confidence.toFixed(2)}`,
      );
    } catch (err) {
      this.logger.error(`OCR failed for invoice ${invoiceId}`, err);

      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: { status: 'UPLOADED' }, // reset so a retry can be triggered
      });

      // Re-throw so Bull marks the job as failed and retries
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
