import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly ocrService: OcrService,
    private readonly cashbackService: CashbackService,
  ) {}

  @Process('process-invoice')
  async handleOcrJob(job: Job<OcrJobData>): Promise<void> {
    const { invoiceId } = job.data;
    this.logger.log(`Starting OCR for invoice ${invoiceId}`);

    try {
      const invoice = await this.prisma.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
      });

      const localPath = path.resolve(process.cwd(), 'uploads', invoiceId);
      if (!fs.existsSync(localPath)) {
        throw new Error(`File not found for invoice ${invoiceId} at ${localPath}`);
      }
      const buffer = fs.readFileSync(localPath);

      const result = await this.ocrService.processDocument(
        buffer,
        invoice.mimeType ?? 'application/pdf',
      );

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
          status: 'PENDING',
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
      this.logger.error(`OCR failed for invoice ${invoiceId}: ${String(err)}`);
      if (err instanceof Error) this.logger.error(err.stack);

      try {
        await this.prisma.invoice.update({
          where: { id: invoiceId },
          data: { status: 'PENDING' },
        });
      } catch (dbErr) {
        this.logger.error(`Failed to reset invoice status: ${String(dbErr)}`);
      }

      throw err;
    }
  }

  @OnQueueFailed()
  onJobFailed(job: Job, error: Error) {
    this.logger.error(`[BULL] Job ${job.id} failed after all retries: ${error.message}`);
  }

  private mapCurrency(raw?: string): string | null {
    if (!raw) return null;
    const upper = raw.toUpperCase().trim();
    const valid = ['EUR', 'USD', 'GBP', 'CNY', 'JPY', 'CHF'];
    return valid.includes(upper) ? upper : null;
  }
}
