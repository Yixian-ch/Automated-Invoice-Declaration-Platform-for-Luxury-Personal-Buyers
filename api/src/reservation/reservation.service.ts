import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateReservationDto } from './dto/create-reservation.dto';
import { compareYmd, isYmd, parisDayEnd, parisDayStart, todayInParis } from './paris-time';
import { normalizeSiret } from './siret';
import { evaluateInvoiceMatch, type MatchOutcome } from './reservation-matcher';

const ACTIVE_STATUSES: ReservationStatus[] = [ReservationStatus.PENDING, ReservationStatus.ACCEPTED];

const RESERVATION_INCLUDE = {
  merchant: { select: { id: true, name: true } },
} as const;

@Injectable()
export class ReservationService {
  private readonly logger = new Logger(ReservationService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── 买手端 ──────────────────────────────────────────────────────────────

  async create(userId: string, dto: CreateReservationDto) {
    if (!isYmd(dto.startDate) || !isYmd(dto.endDate)) {
      throw new BadRequestException('日期格式不正确');
    }
    const today = todayInParis();
    if (compareYmd(dto.startDate, today) < 0) {
      throw new BadRequestException('起始日不能早于今天(巴黎时间)');
    }
    if (compareYmd(dto.endDate, dto.startDate) < 0) {
      throw new BadRequestException('结束日不能早于起始日');
    }

    const merchant = await this.prisma.merchant.findUnique({ where: { id: dto.merchantId } });
    if (!merchant || !merchant.active) {
      throw new BadRequestException('商家不存在或已停用');
    }

    const startAt = parisDayStart(dto.startDate);
    const endAt = parisDayEnd(dto.endDate);

    // 应用层唯一性校验:同一商家下,与已有 PENDING/ACCEPTED 预约日期交叉 → 禁止
    const overlapping = await this.prisma.reservation.findFirst({
      where: {
        userId,
        merchantId: merchant.id,
        status: { in: ACTIVE_STATUSES },
        startAt: { lte: endAt },
        endAt: { gte: startAt },
      },
      orderBy: { startAt: 'asc' },
    });
    if (overlapping) {
      throw new ConflictException(
        '该商家在所选日期内已有审核中或已通过的预约,请先取消原预约再重新预约',
      );
    }

    return this.prisma.reservation.create({
      data: { userId, merchantId: merchant.id, startAt, endAt },
      include: RESERVATION_INCLUDE,
    });
  }

  listMine(userId: string) {
    return this.prisma.reservation.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
      include: RESERVATION_INCLUDE,
    });
  }

  async cancel(userId: string, id: string) {
    const r = await this.prisma.reservation.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('预约不存在');
    if (r.userId !== userId) throw new ForbiddenException('无权操作该预约');
    if (!ACTIVE_STATUSES.includes(r.status)) {
      throw new BadRequestException('该预约已结束,无法取消');
    }
    return this.prisma.reservation.update({
      where: { id },
      data: { status: ReservationStatus.CANCELLED, cancelledAt: new Date() },
      include: RESERVATION_INCLUDE,
    });
  }

  // ─── 后台 ────────────────────────────────────────────────────────────────

  async adminList(status?: ReservationStatus, page = 1, limit = 100) {
    const where = status ? { status } : {};
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          merchant: { select: { id: true, name: true, taxId: true } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          _count: { select: { invoices: true } },
        },
      }),
      this.prisma.reservation.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async accept(adminId: string, id: string) {
    const r = await this.requirePending(id);
    return this.prisma.reservation.update({
      where: { id: r.id },
      data: { status: ReservationStatus.ACCEPTED, reviewedAt: new Date(), reviewedBy: adminId },
      include: RESERVATION_INCLUDE,
    });
  }

  async reject(adminId: string, id: string, note: string) {
    const r = await this.requirePending(id);
    return this.prisma.reservation.update({
      where: { id: r.id },
      data: {
        status: ReservationStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedBy: adminId,
        rejectNote: note.trim(),
      },
      include: RESERVATION_INCLUDE,
    });
  }

  private async requirePending(id: string) {
    const r = await this.prisma.reservation.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('预约不存在');
    if (r.status !== ReservationStatus.PENDING) {
      throw new BadRequestException('只能处理审核中的预约');
    }
    return r;
  }

  // ─── 小票自动匹配(OCR 提取后调用) ──────────────────────────────────────

  /**
   * 根据 OCR 结果为某用户的小票找匹配预约。
   * 只做 IO(查商家、查预约),判定逻辑在 evaluateInvoiceMatch。
   */
  async matchInvoice(
    userId: string,
    ocr: { merchantTaxId?: string | null; purchaseDate?: Date | null },
  ): Promise<MatchOutcome & { siret: string | null }> {
    const siret = normalizeSiret(ocr.merchantTaxId);

    const merchant = siret
      ? await this.prisma.merchant.findUnique({ where: { taxId: siret }, select: { id: true } })
      : null;

    const reservations = merchant
      ? await this.prisma.reservation.findMany({
          where: { userId, merchantId: merchant.id },
          select: { id: true, merchantId: true, status: true, startAt: true, endAt: true },
        })
      : [];

    const outcome = evaluateInvoiceMatch({
      purchaseDate: ocr.purchaseDate ?? null,
      siret,
      merchant,
      reservations,
    });

    this.logger.log(
      `Invoice match for user ${userId}: siret=${siret ?? '-'} merchant=${merchant?.id ?? '-'} ` +
        `→ ${outcome.matched ? `matched ${outcome.reservationId}` : `rejected (${outcome.rejectReason})`}`,
    );

    return { ...outcome, siret };
  }
}
