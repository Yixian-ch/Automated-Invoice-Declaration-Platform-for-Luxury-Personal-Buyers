import { Process, Processor, OnQueueFailed } from '@nestjs/bull';
import type { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

import { PrismaService } from '../prisma/prisma.service.js';
import { OcrService } from '../ocr/ocr.service.js';
import { CashbackService } from '../cashback/cashback.service.js';
import { OCR_QUEUE } from '../invoice/invoice.service.js';
import { AutoReviewService } from '../auto-review/auto-review.service.js';
import { REJECT_REASON_DUPLICATE } from '../auto-review/auto-review.rules.js';

interface OcrJobData {
  invoiceId: string;
}

/**
 * OCR 队列消费者:识别 → 自动审核流水线(置信度 → 去重 → 预约匹配)→ 落库。
 * 整个过程在服务端队列里跑,用户关掉页面/退出登录都不影响。
 */
@Processor(OCR_QUEUE)
export class OcrProcessor {
  private readonly logger = new Logger(OcrProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ocrService: OcrService,
    private readonly cashbackService: CashbackService,
    private readonly autoReview: AutoReviewService,
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

      // ── 自动审核流水线 ──
      const review = await this.autoReview.review({
        invoiceId,
        userId: invoice.userId,
        imageQuality: result.imageQuality ?? null,
        barcode: result.invoiceNumber ?? null,
        merchantTaxId: result.merchantTaxId ?? null,
        purchaseDate: result.purchaseDate ?? null,
      });
      const passed = review.status !== InvoiceStatus.REJECTED;

      const cashbackResult = passed && result.grandTotalAmount
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

      // OCR 自身的复核标记(算术校验等)与流水线的标记合并
      const reviewReasons = Array.from(new Set([...(result.reviewReasons ?? []), ...review.reviewReasons]));
      const needsReview = passed && (review.needsReview || result.needsReview === true);

      const data: Prisma.InvoiceUncheckedUpdateInput = {
        status: review.status,
        rejectReason: review.rejectReason,
        reviewedAt: passed ? null : new Date(),
        reservationId: review.reservationId,
        matchedMerchantId: review.matchedMerchantId,
        needsReview,
        reviewReasons,
        fraudFlags: review.fraudFlags === null ? Prisma.DbNull : (review.fraudFlags as Prisma.InputJsonValue),
        // 去重键:规范化后的条形码;拒绝时也保留原值便于排查
        invoiceNumber: review.barcode ?? result.invoiceNumber ?? null,
        imageQuality: result.imageQuality ?? null,
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
        arithmeticCheck: result.arithmeticCheck ?? null,
        cashbackAmount: cashbackResult ? cashbackResult.totalCashback : null,
        cashbackBreakdown: cashbackResult ? (cashbackResult.breakdown as any) : Prisma.DbNull,
        ocrConfidence: result.confidence,
        ocrRawJson: {
          ...result.rawJson,
          auto_review: {
            status: review.status,
            rejected_by: review.rejectedBy,
            barcode: review.barcode,
            siret: review.siret,
            threshold: this.autoReview.confidenceThreshold,
          },
        } as any,
        ocrCompletedAt: new Date(),
      };

      try {
        await this.prisma.invoice.update({ where: { id: invoiceId }, data });
        // 并发兜底:两个用户同时上传同一张小票时预检互相看不到,写入后再核对一次
        if (passed && review.barcode) {
          await this.autoReview.flagCrossUserDuplicatesAfterWrite(invoiceId, invoice.userId, review.barcode);
        }
      } catch (err) {
        // 部分唯一索引 (userId, invoiceNumber) WHERE status <> REJECTED 撞上:
        // 同一批里两张同号小票并发处理,后到的按"重复提交"拒绝
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          this.logger.warn(`Invoice ${invoiceId}: barcode unique index hit — rejecting as duplicate`);
          await this.prisma.invoice.update({
            where: { id: invoiceId },
            data: {
              ...data,
              status: InvoiceStatus.REJECTED,
              rejectReason: REJECT_REASON_DUPLICATE,
              reviewedAt: new Date(),
              reservationId: null,
              needsReview: false,
              cashbackAmount: null,
              cashbackBreakdown: Prisma.DbNull,
            },
          });
        } else {
          throw err;
        }
      }

      this.logger.log(
        `OCR complete for invoice ${invoiceId} — confidence ${result.confidence.toFixed(2)}` +
          (result.imageQuality != null ? ` — imageQuality ${result.imageQuality}` : '') +
          (cashbackResult ? ` — cashback ${cashbackResult.totalCashback.toFixed(2)}€` : '') +
          (passed
            ? ` — PENDING${review.needsReview ? ' (flagged)' : ''}`
            : ` — auto-rejected by ${review.rejectedBy}: ${review.rejectReason}`),
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
