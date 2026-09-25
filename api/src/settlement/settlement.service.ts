import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { InvoiceStatus, SettlementStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutService } from './payout.service';
import { ConfirmSettlementDto } from './dto/confirm-settlement.dto';
import { PartnerCallbackDto } from './dto/partner-callback.dto';

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payout: PayoutService,
    private readonly config: ConfigService,
  ) {}

  /** 客户已确认返点金额(CONFIRMED)、尚未选择结算方式的小票 */
  async listPendingConfirmation(userId: string) {
    return this.prisma.invoice.findMany({
      where: {
        userId,
        status: InvoiceStatus.CONFIRMED,
        cashbackAmount: { gt: 0 },
        settlement: null,
        deletedAt: null,
      },
      select: {
        id: true,
        vendorName: true,
        purchaseDate: true,
        grandTotalAmount: true,
        cashbackAmount: true,
        currency: true,
      },
      orderBy: { purchaseDate: 'desc' },
    });
  }

  async listMine(userId: string) {
    return this.prisma.cashbackSettlement.findMany({
      where: { userId },
      include: {
        invoice: { select: { vendorName: true, purchaseDate: true, grandTotalAmount: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Customer confirms a reconciled cashback and chooses the settlement
   * method. For bank transfers the payout order is pushed to the partner
   * right away — they pay the customer once they receive the data.
   */
  async confirm(userId: string, dto: ConfirmSettlementDto) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: dto.invoiceId },
      select: {
        id: true,
        userId: true,
        status: true,
        cashbackAmount: true,
        currency: true,
        deletedAt: true,
      },
    });
    if (!invoice || invoice.deletedAt) throw new NotFoundException('小票不存在');
    if (invoice.userId !== userId) throw new ForbiddenException();
    // 只有客户确认过金额(CONFIRMED)的小票才能进入结算
    if (invoice.status !== InvoiceStatus.CONFIRMED) {
      throw new BadRequestException('请先确认该小票的返点金额,再选择结算方式');
    }
    const amount = invoice.cashbackAmount;
    if (!amount || Number(amount) <= 0) {
      throw new BadRequestException('该小票没有可结算的返点');
    }
    const isBank = dto.method === 'BANK_TRANSFER';

    // Cashback is computed in the invoice currency but the payout order is
    // wired in EUR — refuse rather than pay the wrong amount
    if (isBank && invoice.currency && invoice.currency !== 'EUR') {
      throw new BadRequestException('目前仅支持欧元（EUR）小票的自动打款，请联系客服处理');
    }

    const iban = isBank ? dto.bankIban!.replace(/\s+/g, '').toUpperCase() : null;

    let settlement;
    try {
      settlement = await this.prisma.$transaction(async (tx) => {
        const created = await tx.cashbackSettlement.create({
          data: {
            invoiceId: invoice.id,
            userId,
            amount,
            method: dto.method,
            bankAccountName: isBank ? dto.bankAccountName!.trim() : null,
            bankName: isBank ? dto.bankName!.trim() : null,
            bankIban: iban,
            bankBic: isBank ? dto.bankBic?.trim() || null : null,
          },
        });
        if (isBank && dto.saveBankInfo) {
          await tx.user.update({
            where: { id: userId },
            data: {
              bankAccountName: dto.bankAccountName!.trim(),
              bankName: dto.bankName!.trim(),
              bankIban: iban,
              // 弹窗已不收集 BIC;只有请求里带了才覆盖,避免清掉用户已保存的 BIC
              ...(dto.bankBic !== undefined ? { bankBic: dto.bankBic.trim() || null } : {}),
            },
          });
        }
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: 'SETTLEMENT_CONFIRMED',
            resourceType: 'CashbackSettlement',
            resourceId: created.id,
            userId,
            meta: { invoiceId: invoice.id, amount: String(amount), method: dto.method },
          },
        });
        return created;
      });
    } catch (err) {
      // Unique constraint on invoiceId: two concurrent confirmations
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('该小票的返点已确认过');
      }
      throw err;
    }

    // Vouchers and gift cards are issued manually — the settlement stays
    // CONFIRMED (待发放) until an admin fulfills it
    if (!isBank) return settlement;

    return this.dispatchPayout(settlement.id);
  }

  /** Admin overview of all settlements, optionally filtered by status */
  async listAll(status?: SettlementStatus) {
    return this.prisma.cashbackSettlement.findMany({
      where: status ? { status } : undefined,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        invoice: { select: { vendorName: true, purchaseDate: true, grandTotalAmount: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  /** Admin marks a manually issued voucher / gift card as delivered */
  async fulfill(settlementId: string) {
    const settlement = await this.prisma.cashbackSettlement.findUnique({
      where: { id: settlementId },
    });
    if (!settlement) throw new NotFoundException('结算记录不存在');
    if (settlement.method === 'BANK_TRANSFER') {
      throw new BadRequestException('银行卡打款由合作方回调确认，不能手动标记');
    }
    if (settlement.status !== SettlementStatus.CONFIRMED) {
      throw new BadRequestException('只有待发放的结算可以标记为已发放');
    }
    return this.prisma.cashbackSettlement.update({
      where: { id: settlementId },
      data: { status: SettlementStatus.PAID, paidAt: new Date() },
    });
  }

  /**
   * Push (or re-push) the payout order to the partner company.
   * Status transitions are guarded so a partner webhook landing mid-flight
   * (they pay as soon as they receive the data) is never overwritten.
   */
  async dispatchPayout(settlementId: string) {
    const settlement = await this.prisma.cashbackSettlement.findUniqueOrThrow({
      where: { id: settlementId },
    });
    // Only bank transfers ever go to the payout partner
    if (settlement.method !== 'BANK_TRANSFER') return settlement;
    // Only CONFIRMED (never sent / crashed before send) and FAILED may dispatch
    if (
      settlement.status !== SettlementStatus.CONFIRMED &&
      settlement.status !== SettlementStatus.FAILED
    ) {
      return settlement;
    }

    const result = await this.payout.sendPayout({
      settlementId: settlement.id,
      amount: String(settlement.amount),
      currency: 'EUR',
      beneficiaryName: settlement.bankAccountName ?? '',
      iban: settlement.bankIban ?? '',
      bic: settlement.bankBic ?? undefined,
      reference: `RUICHI-${settlement.id.slice(0, 8).toUpperCase()}`,
    });

    // Guarded write: if the webhook already moved this settlement to a
    // terminal state, leave it alone and return the current row
    await this.prisma.cashbackSettlement.updateMany({
      where: {
        id: settlement.id,
        status: { in: [SettlementStatus.CONFIRMED, SettlementStatus.FAILED] },
        paidAt: null,
      },
      data: result.ok
        ? {
            status: SettlementStatus.SENT,
            sentAt: new Date(),
            // keep the first partnerRef if the retry response has none
            ...(result.partnerRef ? { partnerRef: result.partnerRef } : {}),
            failureReason: null,
          }
        : { status: SettlementStatus.FAILED, failureReason: result.error ?? 'Unknown error' },
    });

    return this.prisma.cashbackSettlement.findUniqueOrThrow({ where: { id: settlement.id } });
  }

  /**
   * Owner re-sends the payout order. Covers FAILED sends and CONFIRMED rows
   * stranded by a crash between confirmation and dispatch.
   */
  async retry(userId: string, settlementId: string) {
    const settlement = await this.prisma.cashbackSettlement.findUnique({
      where: { id: settlementId },
    });
    if (!settlement) throw new NotFoundException('结算记录不存在');
    if (settlement.userId !== userId) throw new ForbiddenException();
    if (settlement.method !== 'BANK_TRANSFER') {
      throw new BadRequestException('代金券/礼品券由平台发放，无需重新发送');
    }
    if (
      settlement.status !== SettlementStatus.FAILED &&
      settlement.status !== SettlementStatus.CONFIRMED
    ) {
      throw new BadRequestException('该结算不需要重新发送打款');
    }
    return this.dispatchPayout(settlementId);
  }

  /** Partner webhook: payment executed or definitively failed */
  async handlePartnerCallback(secret: string | undefined, body: PartnerCallbackDto) {
    const expected = this.config.get<string>('PAYOUT_WEBHOOK_SECRET');
    const provided = Buffer.from(secret ?? '');
    const wanted = Buffer.from(expected ?? '');
    if (!expected || provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
      throw new UnauthorizedException();
    }

    // Exactly one identifier must be present — an empty body must never
    // match an arbitrary row
    if (!body.settlementId && !body.partnerRef) {
      throw new BadRequestException('settlementId or partnerRef is required');
    }
    const settlement = await this.prisma.cashbackSettlement.findFirst({
      where: body.settlementId ? { id: body.settlementId } : { partnerRef: body.partnerRef },
    });
    if (!settlement) throw new NotFoundException('Settlement not found');

    if (body.status === 'paid') {
      await this.prisma.cashbackSettlement.updateMany({
        where: { id: settlement.id, status: { not: SettlementStatus.PAID } },
        data: { status: SettlementStatus.PAID, paidAt: new Date(), failureReason: null },
      });
    } else {
      // Never regress a settlement the partner already reported as paid
      await this.prisma.cashbackSettlement.updateMany({
        where: { id: settlement.id, status: { not: SettlementStatus.PAID } },
        data: {
          status: SettlementStatus.FAILED,
          failureReason: body.reason ?? 'Rejected by partner',
        },
      });
    }
    this.logger.log(`Partner callback: settlement ${settlement.id} → ${body.status}`);
    return { ok: true };
  }
}
