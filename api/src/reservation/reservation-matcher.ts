/**
 * 小票 ↔ 预约 自动匹配(纯逻辑,无 IO,便于单元测试)。
 *
 * 规则(需求原文):
 *   发票时间 ∉ [startAt, endAt] 或 商家不匹配 或 预约状态不是 ACCEPTED
 *   → status = REJECTED, rejectReason = "非预约时间/商铺购物不予返点"
 *
 * 用户拍板的补充:
 *   - 精度到天,日期按 Europe/Paris 解释;
 *   - OCR 提取不到 14 位税号、或 Luhn 校验不过 → 自动拒绝,原因"照片不清晰";
 *   - 提取到了但库里没有该商家 → 自动拒绝,原因"非预约时间/商铺购物不予返点"。
 */

import { compareYmd, toParisDateString } from './paris-time';

export const REJECT_REASON_NO_RESERVATION = '非预约时间/商铺购物不予返点';
export const REJECT_REASON_UNREADABLE = '照片不清晰';

export type ReservationStatusLike = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export interface MatchableReservation {
  id: string;
  merchantId: string;
  status: ReservationStatusLike;
  startAt: Date;
  endAt: Date;
}

export interface MatchInput {
  /** OCR 提取的购买日期(UTC Date;缺失表示识别失败) */
  purchaseDate: Date | null | undefined;
  /** 已通过 normalizeSiret 的 14 位税号;null 表示没提取到或校验不过 */
  siret: string | null;
  /** 按 siret 在商家表里查到的商家;null 表示非合作商家 */
  merchant: { id: string } | null;
  /** 该用户在该商家下的预约(任意状态,由调用方查出) */
  reservations: MatchableReservation[];
}

export type MatchOutcome =
  | { matched: true; reservationId: string; merchantId: string; rejectReason: null }
  | { matched: false; reservationId: null; merchantId: string | null; rejectReason: string };

/** 发票的巴黎日期是否落在预约的 [startAt, endAt] 闭区间(按巴黎日期比较) */
export function isDateWithinReservation(purchaseDate: Date, r: { startAt: Date; endAt: Date }): boolean {
  const day = toParisDateString(purchaseDate);
  const start = toParisDateString(r.startAt);
  const end = toParisDateString(r.endAt);
  return compareYmd(start, day) <= 0 && compareYmd(day, end) <= 0;
}

/**
 * 在给定预约里找到一条 ACCEPTED、商家一致、日期覆盖发票日期的预约。
 * 多条时取开始日最早的一条。
 */
export function findMatchingReservation(
  purchaseDate: Date,
  merchantId: string,
  reservations: MatchableReservation[],
): MatchableReservation | null {
  const candidates = reservations
    .filter((r) => r.status === 'ACCEPTED')
    .filter((r) => r.merchantId === merchantId)
    .filter((r) => isDateWithinReservation(purchaseDate, r))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return candidates[0] ?? null;
}

export function evaluateInvoiceMatch(input: MatchInput): MatchOutcome {
  const { purchaseDate, siret, merchant, reservations } = input;

  if (!siret) {
    return { matched: false, reservationId: null, merchantId: null, rejectReason: REJECT_REASON_UNREADABLE };
  }
  if (!purchaseDate || Number.isNaN(purchaseDate.getTime())) {
    return {
      matched: false,
      reservationId: null,
      merchantId: merchant?.id ?? null,
      rejectReason: REJECT_REASON_UNREADABLE,
    };
  }
  if (!merchant) {
    return { matched: false, reservationId: null, merchantId: null, rejectReason: REJECT_REASON_NO_RESERVATION };
  }

  const hit = findMatchingReservation(purchaseDate, merchant.id, reservations);
  if (!hit) {
    return {
      matched: false,
      reservationId: null,
      merchantId: merchant.id,
      rejectReason: REJECT_REASON_NO_RESERVATION,
    };
  }
  return { matched: true, reservationId: hit.id, merchantId: merchant.id, rejectReason: null };
}
