import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { InvoiceStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { CashbackService } from '../cashback/cashback.service.js';
import {
  applyConfirm,
  applyDispute,
  assertAmountEditable,
  assertCanApprove,
  assertCanReject,
  assertCanResolveDispute,
} from './cashback-confirmation.js';
import { REVIEW_REASON_DISPUTED } from '../auto-review/auto-review.rules.js';
import type { CorrectInvoiceDto } from './dto/correct-invoice.dto.js';

export const OCR_QUEUE = 'ocr';

const VALID_STATUSES = Object.values(InvoiceStatus) as string[];

/** 解析 ?status=PENDING,DISPUTED 这种多值筛选 */
export function parseStatusFilter(raw?: string): InvoiceStatus[] | undefined {
  if (!raw) return undefined;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
  const valid = parts.filter((s) => VALID_STATUSES.includes(s)) as InvoiceStatus[];
  return valid.length > 0 ? valid : undefined;
}

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
          rejectReason: true,
          reservationId: true,
          confirmedAt: true,
          disputedAt: true,
          disputeCount: true,
          disputeResolutionNote: true,
          ocrCompletedAt: true,
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
    const where: Prisma.InvoiceWhereInput = {};
    const statuses = parseStatusFilter(status);
    if (statuses) where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    if (userId) where.userId = userId;

    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        // 金额异议和风控标记的优先排在前面,再按时间倒序
        orderBy: [{ needsReview: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          matchedMerchant: { select: { id: true, name: true, taxId: true } },
          reservation: { select: { id: true, startAt: true, endAt: true, status: true } },
          // 客户选择的结算方式(未选择时为 null)
          settlement: {
            select: {
              id: true,
              method: true,
              status: true,
              amount: true,
              bankAccountName: true,
              bankName: true,
              bankIban: true,
              confirmedAt: true,
              paidAt: true,
            },
          },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /** 按当前识别数据用规则重算返点(返点规则不允许人工覆盖) */
  private async recomputeCashback(invoice: {
    vendorName: string | null;
    grandTotalAmount: Prisma.Decimal | null;
    taxRefundAmount: Prisma.Decimal | null;
    lineItems: Prisma.JsonValue;
  }) {
    const lineItems = Array.isArray(invoice.lineItems) ? (invoice.lineItems as any[]) : [];
    if (!invoice.grandTotalAmount || !invoice.vendorName) return null;
    return this.cashback.calculate(
      invoice.vendorName,
      Number(invoice.grandTotalAmount),
      invoice.taxRefundAmount != null ? Number(invoice.taxRefundAmount) : null,
      lineItems.map((li: any) => ({
        description: li.description,
        brand: li.brand ?? null,
        itemCategory: li.itemCategory ?? null,
        amount_ttc: li.amount_ttc ?? 0,
      })),
    );
  }

  /**
   * 后台通过:PENDING/DISPUTED → AWAITING_CONFIRMATION(待客户确认返点金额)。
   * APPROVED 不再作为停留状态。
   */
  async approve(adminId: string, invoiceId: string, note?: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    assertCanApprove(invoice);

    const cashbackResult = await this.recomputeCashback(invoice);
    if (!cashbackResult || cashbackResult.totalCashback <= 0) {
      throw new BadRequestException('无法按规则计算返点(门店未配置返点规则或金额为空),请先更正识别数据');
    }

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.AWAITING_CONFIRMATION,
        cashbackAmount: cashbackResult.totalCashback,
        cashbackBreakdown: cashbackResult.breakdown as any,
        reviewedAt: new Date(),
        reviewedById: adminId,
        reviewNote: note ?? null,
        rejectReason: null,
        needsReview: false,
      },
    });
  }

  async reject(adminId: string, invoiceId: string, note: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    assertCanReject(invoice);
    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedById: adminId,
        reviewNote: note,
        // 一个字段管所有拒绝原因,买手端展示的就是它
        rejectReason: note,
        needsReview: false,
      },
    });
  }

  /**
   * 后台更正识别数据(门店/日期/总额/商品明细)。返点随后由规则重算,
   * CONFIRMED(金额已锁定)的小票拒绝任何更正。
   */
  async correctInvoice(invoiceId: string, dto: CorrectInvoiceDto) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    assertAmountEditable(invoice);

    const data: Prisma.InvoiceUncheckedUpdateInput = {};
    if (dto.vendorName !== undefined) data.vendorName = dto.vendorName;
    if (dto.purchaseDate !== undefined) data.purchaseDate = new Date(dto.purchaseDate);
    if (dto.grandTotalAmount !== undefined) data.grandTotalAmount = dto.grandTotalAmount;
    if (dto.lineItems !== undefined) {
      data.lineItems = dto.lineItems.map((li) => ({
        description: li.description,
        brand: li.brand ?? null,
        itemCategory: li.itemCategory ?? null,
        quantity: li.quantity ?? 1,
        amount_ttc: li.amount_ttc,
        confidence: 1,
      })) as any;
    }

    // 更正后立即按规则重算预估返点,后台和客户看到的都是最新值
    const merged = {
      vendorName: (data.vendorName as string | undefined) ?? invoice.vendorName,
      grandTotalAmount:
        data.grandTotalAmount !== undefined
          ? new Prisma.Decimal(data.grandTotalAmount as string)
          : invoice.grandTotalAmount,
      taxRefundAmount: invoice.taxRefundAmount,
      lineItems: (data.lineItems as Prisma.JsonValue | undefined) ?? invoice.lineItems,
    };
    const cashbackResult = await this.recomputeCashback(merged);
    data.cashbackAmount = cashbackResult ? cashbackResult.totalCashback : null;
    data.cashbackBreakdown = cashbackResult ? (cashbackResult.breakdown as any) : Prisma.DbNull;

    // 异议中的小票保留"需人工介入"标记,直到复核完成;其余更正后清掉
    if (invoice.status !== InvoiceStatus.DISPUTED) data.needsReview = false;

    // 待客户确认的小票被更正 → 金额变了,客户看到的已不作数:退回人工队列重新通过
    // (也避免更正后返点为空时卡在既确认不了、也通不过的死角)
    if (invoice.status === InvoiceStatus.AWAITING_CONFIRMATION) {
      data.status = InvoiceStatus.PENDING;
      data.reviewedAt = null;
      data.reviewedById = null;
    }

    return this.prisma.invoice.update({ where: { id: invoiceId }, data });
  }

  // ─── 客户确认返点金额 ─────────────────────────────────────────────────────

  /** 客户"确认无误":AWAITING_CONFIRMATION → CONFIRMED,金额锁定 */
  async confirmCashback(userId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.deletedAt) throw new NotFoundException('小票不存在');
    if (invoice.userId !== userId) throw new ForbiddenException();

    const patch = applyConfirm(invoice);

    // 条件更新:状态和金额都要与客户刚看到的一致。并发点两次只有一次生效;
    // 后台在客户页面打开后改过金额的话这里不会锁定旧金额
    const res = await this.prisma.invoice.updateMany({
      where: {
        id: invoiceId,
        status: InvoiceStatus.AWAITING_CONFIRMATION,
        cashbackAmount: invoice.cashbackAmount!,
      },
      data: patch,
    });
    if (res.count === 0) throw new ConflictException('该小票的返点金额或状态刚有变化,请刷新后重新核对');

    const locked = await this.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'CASHBACK_CONFIRMED',
        resourceType: 'Invoice',
        resourceId: invoiceId,
        userId,
        meta: { cashbackAmount: locked.cashbackAmount?.toString() ?? null },
      },
    });
    return locked;
  }

  /** 客户"金额有误":AWAITING_CONFIRMATION → DISPUTED,回到人工审核队列 */
  async disputeCashback(userId: string, invoiceId: string, input: { category: string; note: string }) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice || invoice.deletedAt) throw new NotFoundException('小票不存在');
    if (invoice.userId !== userId) throw new ForbiddenException();

    const patch = applyDispute(invoice, input);

    const reviewReasons = Array.from(new Set([...(invoice.reviewReasons ?? []), REVIEW_REASON_DISPUTED]));
    const res = await this.prisma.invoice.updateMany({
      where: { id: invoiceId, status: InvoiceStatus.AWAITING_CONFIRMATION },
      data: { ...patch, reviewReasons, disputeResolutionNote: null },
    });
    if (res.count === 0) throw new ConflictException('该小票状态已变化,请刷新后重试');

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'CASHBACK_DISPUTED',
        resourceType: 'Invoice',
        resourceId: invoiceId,
        userId,
        meta: { category: input.category, note: input.note.trim(), disputeCount: patch.disputeCount },
      },
    });
    return this.prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  }

  /**
   * 后台处理异议:按当前识别数据重算返点(修正过识别数据则金额随之变化,
   * 否则维持原金额),重新置为 AWAITING_CONFIRMATION 并附复核说明。
   */
  async resolveDispute(adminId: string, invoiceId: string, note: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const cashbackResult = await this.recomputeCashback(invoice);
    if (!cashbackResult || cashbackResult.totalCashback <= 0) {
      throw new BadRequestException('无法按规则计算返点,请先更正识别数据');
    }
    // 与客户提出异议时看到的金额比较(更正识别数据会先改掉 cashbackAmount,不能拿它当基线)
    const previous = invoice.disputedAmount != null
      ? Number(invoice.disputedAmount)
      : invoice.cashbackAmount != null ? Number(invoice.cashbackAmount) : 0;
    const amountChanged = Math.abs(cashbackResult.totalCashback - previous) >= 0.005;

    assertCanResolveDispute(invoice, { amountChanged, note });

    const reviewReasons = (invoice.reviewReasons ?? []).filter((r) => r !== REVIEW_REASON_DISPUTED);
    const updated = await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.AWAITING_CONFIRMATION,
        cashbackAmount: cashbackResult.totalCashback,
        cashbackBreakdown: cashbackResult.breakdown as any,
        disputeResolutionNote: note?.trim() || (amountChanged ? '已根据您的反馈重新核算返点金额' : null),
        reviewedAt: new Date(),
        reviewedById: adminId,
        needsReview: false,
        reviewReasons,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'CASHBACK_DISPUTE_RESOLVED',
        resourceType: 'Invoice',
        resourceId: invoiceId,
        userId: invoice.userId,
        meta: {
          previousAmount: previous,
          newAmount: cashbackResult.totalCashback,
          amountChanged,
          note: note?.trim() ?? null,
        },
      },
    });
    return updated;
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
