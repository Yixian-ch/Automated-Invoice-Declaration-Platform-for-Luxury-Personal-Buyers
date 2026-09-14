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
import { InvoiceStatus, SettlementStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutService } from './payout.service';
import { ConfirmSettlementDto } from './dto/confirm-settlement.dto';

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payout: PayoutService,
    private readonly config: ConfigService,
  ) {}

  /** Approved invoices whose cashback the customer has not yet confirmed */
  async listPendingConfirmation(userId: string) {
    return this.prisma.invoice.findMany({
      where: {
        userId,
        status: InvoiceStatus.APPROVED,
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
      select: { id: true, userId: true, status: true, cashbackAmount: true, deletedAt: true },
    });
    if (!invoice || invoice.deletedAt) throw new NotFoundException('小票不存在');
    if (invoice.userId !== userId) throw new ForbiddenException();
    if (invoice.status !== InvoiceStatus.APPROVED) {
      throw new BadRequestException('该小票尚未通过审核，返点未确认');
    }
    const amount = invoice.cashbackAmount;
    if (!amount || Number(amount) <= 0) {
      throw new BadRequestException('该小票没有可结算的返点');
    }

    const iban = dto.bankIban.replace(/\s+/g, '').toUpperCase();

    let settlement;
    try {
      settlement = await this.prisma.$transaction(async (tx) => {
        const created = await tx.cashbackSettlement.create({
          data: {
            invoiceId: invoice.id,
            userId,
            amount,
            method: dto.method,
            bankAccountName: dto.bankAccountName.trim(),
            bankIban: iban,
            bankBic: dto.bankBic?.trim() || null,
          },
        });
        if (dto.saveBankInfo) {
          await tx.user.update({
            where: { id: userId },
            data: {
              bankAccountName: dto.bankAccountName.trim(),
              bankIban: iban,
              bankBic: dto.bankBic?.trim() || null,
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

    return this.dispatchPayout(settlement.id);
  }

  /** Push (or re-push) the payout order to the partner company */
  async dispatchPayout(settlementId: string) {
    const settlement = await this.prisma.cashbackSettlement.findUniqueOrThrow({
      where: { id: settlementId },
    });
    if (settlement.status === SettlementStatus.PAID) return settlement;

    const result = await this.payout.sendPayout({
      settlementId: settlement.id,
      amount: String(settlement.amount),
      currency: 'EUR',
      beneficiaryName: settlement.bankAccountName ?? '',
      iban: settlement.bankIban ?? '',
      bic: settlement.bankBic ?? undefined,
      reference: `RUICHI-${settlement.id.slice(0, 8).toUpperCase()}`,
    });

    return this.prisma.cashbackSettlement.update({
      where: { id: settlement.id },
      data: result.ok
        ? {
            status: SettlementStatus.SENT,
            sentAt: new Date(),
            partnerRef: result.partnerRef ?? null,
            failureReason: null,
          }
        : { status: SettlementStatus.FAILED, failureReason: result.error ?? 'Unknown error' },
    });
  }

  /** Owner retries a failed payout */
  async retry(userId: string, settlementId: string) {
    const settlement = await this.prisma.cashbackSettlement.findUnique({
      where: { id: settlementId },
    });
    if (!settlement) throw new NotFoundException('结算记录不存在');
    if (settlement.userId !== userId) throw new ForbiddenException();
    if (settlement.status !== SettlementStatus.FAILED) {
      throw new BadRequestException('只有失败的打款可以重试');
    }
    return this.dispatchPayout(settlementId);
  }

  /** Partner webhook: payment executed or definitively failed */
  async handlePartnerCallback(
    secret: string | undefined,
    body: { settlementId?: string; partnerRef?: string; status: string; reason?: string },
  ) {
    const expected = this.config.get<string>('PAYOUT_WEBHOOK_SECRET');
    if (!expected || secret !== expected) throw new UnauthorizedException();

    const settlement = await this.prisma.cashbackSettlement.findFirst({
      where: body.settlementId ? { id: body.settlementId } : { partnerRef: body.partnerRef },
    });
    if (!settlement) throw new NotFoundException('Settlement not found');

    const paid = body.status === 'paid';
    const updated = await this.prisma.cashbackSettlement.update({
      where: { id: settlement.id },
      data: paid
        ? { status: SettlementStatus.PAID, paidAt: new Date(), failureReason: null }
        : { status: SettlementStatus.FAILED, failureReason: body.reason ?? 'Rejected by partner' },
    });
    this.logger.log(`Partner callback: settlement ${settlement.id} → ${updated.status}`);
    return { ok: true };
  }
}
