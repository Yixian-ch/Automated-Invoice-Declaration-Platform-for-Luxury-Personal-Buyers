import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReservationService } from '../reservation/reservation.service';
import {
  checkConfidence,
  checkDuplicate,
  parseConfidenceThreshold,
  type ExistingInvoiceRef,
} from './auto-review.rules';

export interface AutoReviewInput {
  invoiceId: string;
  userId: string;
  imageQuality: number | null | undefined;
  barcode: string | null | undefined;
  merchantTaxId: string | null | undefined;
  purchaseDate: Date | null | undefined;
}

export interface AutoReviewOutcome {
  /** 通过 → PENDING(进人工队列);否则 REJECTED */
  status: InvoiceStatus;
  rejectReason: string | null;
  /** 哪一步拒的:confidence | duplicate | reservation;通过为 null */
  rejectedBy: 'confidence' | 'duplicate' | 'reservation' | null;
  needsReview: boolean;
  reviewReasons: string[];
  fraudFlags: Record<string, unknown> | null;
  reservationId: string | null;
  matchedMerchantId: string | null;
  /** 规范化后的条形码(去重键);拒绝时也尽量保留便于排查 */
  barcode: string | null;
  siret: string | null;
}

/**
 * 自动审核流水线:置信度检查 → 条形码去重 → 预约匹配。
 * 只做 IO 和编排;判定逻辑在 auto-review.rules / reservation-matcher。
 */
@Injectable()
export class AutoReviewService {
  private readonly logger = new Logger(AutoReviewService.name);
  private readonly threshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationService,
    config: ConfigService,
  ) {
    this.threshold = parseConfidenceThreshold(config.get<string>('OCR_MIN_CONFIDENCE'));
    this.logger.log(`OCR confidence threshold = ${this.threshold}`);
  }

  get confidenceThreshold(): number {
    return this.threshold;
  }

  /**
   * 落库后的二次核对:两个用户同一时刻上传同一张小票时,各自的预检都看不到对方。
   * 写入后再查一次,发现跨用户同号且尚未标记 → 补上风控标记。
   */
  async flagCrossUserDuplicatesAfterWrite(invoiceId: string, userId: string, barcode: string): Promise<boolean> {
    const existing = await this.findActiveByBarcode(barcode, invoiceId);
    const dup = checkDuplicate(userId, existing);
    if (dup.kind !== 'cross-user') return false;

    const current = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { status: true, reviewReasons: true, fraudFlags: true },
    });
    if (!current || current.status === InvoiceStatus.REJECTED) return false;
    const flags = (current.fraudFlags ?? {}) as Record<string, unknown>;
    if (flags.duplicateBarcode) return false; // 预检已标记

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        needsReview: true,
        reviewReasons: Array.from(new Set([...(current.reviewReasons ?? []), dup.reviewReason])),
        fraudFlags: {
          ...flags,
          duplicateBarcode: {
            sameUser: false,
            invoices: dup.duplicates.map((d) => ({ invoiceId: d.id, userId: d.userId })),
          },
        },
      },
    });
    this.logger.warn(`Invoice ${invoiceId}: cross-user duplicate detected after write — flagged`);
    return true;
  }

  /** 与该条形码相同、非拒绝状态、未删除、且不是自己的小票 */
  async findActiveByBarcode(barcode: string, excludeInvoiceId: string): Promise<ExistingInvoiceRef[]> {
    return this.prisma.invoice.findMany({
      where: {
        invoiceNumber: barcode,
        id: { not: excludeInvoiceId },
        status: { not: InvoiceStatus.REJECTED },
        deletedAt: null,
      },
      select: { id: true, userId: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async review(input: AutoReviewInput): Promise<AutoReviewOutcome> {
    const base: AutoReviewOutcome = {
      status: InvoiceStatus.PENDING,
      rejectReason: null,
      rejectedBy: null,
      needsReview: false,
      reviewReasons: [],
      fraudFlags: null,
      reservationId: null,
      matchedMerchantId: null,
      barcode: null,
      siret: null,
    };

    // ── 规则 1:置信度 ──
    const conf = checkConfidence(
      {
        imageQuality: input.imageQuality,
        barcode: input.barcode,
        merchantTaxId: input.merchantTaxId,
        purchaseDate: input.purchaseDate,
      },
      this.threshold,
    );
    if (!conf.ok) {
      this.logger.log(`Invoice ${input.invoiceId}: confidence check failed (${conf.failedChecks.join(', ')})`);
      return {
        ...base,
        status: InvoiceStatus.REJECTED,
        rejectReason: conf.rejectReason,
        rejectedBy: 'confidence',
        reviewReasons: conf.failedChecks.map((c) => `不可读: ${c}`),
      };
    }
    base.barcode = conf.barcode;
    base.siret = conf.siret;

    // ── 规则 2:条形码去重(全局,只比非拒绝状态) ──
    const existing = await this.findActiveByBarcode(conf.barcode, input.invoiceId);
    const dup = checkDuplicate(input.userId, existing);
    if (dup.kind === 'same-user') {
      this.logger.log(`Invoice ${input.invoiceId}: duplicate of ${dup.duplicateOf.id} (same user)`);
      return {
        ...base,
        status: InvoiceStatus.REJECTED,
        rejectReason: dup.rejectReason,
        rejectedBy: 'duplicate',
        fraudFlags: { duplicateBarcode: { invoiceId: dup.duplicateOf.id, userId: dup.duplicateOf.userId, sameUser: true } },
      };
    }
    if (dup.kind === 'cross-user') {
      this.logger.warn(
        `Invoice ${input.invoiceId}: barcode ${conf.barcode} also held by ${dup.duplicates.map((d) => d.userId).join(',')} — flagged`,
      );
      base.needsReview = true;
      base.reviewReasons = [dup.reviewReason];
      base.fraudFlags = {
        duplicateBarcode: {
          sameUser: false,
          invoices: dup.duplicates.map((d) => ({ invoiceId: d.id, userId: d.userId })),
        },
      };
    }

    // ── 规则 3:预约匹配(复用 ReservationService 的查找 + 判定) ──
    const match = await this.reservations.matchInvoice(input.userId, {
      merchantTaxId: conf.siret,
      purchaseDate: input.purchaseDate ?? null,
    });
    if (!match.matched) {
      this.logger.log(`Invoice ${input.invoiceId}: no reservation match (${match.rejectReason})`);
      return {
        ...base,
        status: InvoiceStatus.REJECTED,
        rejectReason: match.rejectReason,
        rejectedBy: 'reservation',
        matchedMerchantId: match.merchantId,
      };
    }

    // ── 通过 → 人工队列 ──
    return {
      ...base,
      status: InvoiceStatus.PENDING,
      reservationId: match.reservationId,
      matchedMerchantId: match.merchantId,
    };
  }
}
