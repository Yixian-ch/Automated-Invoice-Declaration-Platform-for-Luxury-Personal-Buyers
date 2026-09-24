import {
  evaluateInvoiceMatch,
  findMatchingReservation,
  isDateWithinReservation,
  REJECT_REASON_NO_RESERVATION,
  REJECT_REASON_UNREADABLE,
  type MatchableReservation,
} from './reservation-matcher';
import { parisDayEnd, parisDayStart } from './paris-time';

const MERCHANT = { id: 'm_samaritaine' };
const OTHER_MERCHANT_ID = 'm_galeries';
const SIRET = '53775858300059';

/** 预约:巴黎日期闭区间 [start, end],存成 UTC */
function reservation(
  overrides: Partial<MatchableReservation> & { start: string; end: string },
): MatchableReservation {
  const { start, end, ...rest } = overrides;
  return {
    id: rest.id ?? `r_${start}_${end}`,
    merchantId: rest.merchantId ?? MERCHANT.id,
    status: rest.status ?? 'ACCEPTED',
    startAt: parisDayStart(start),
    endAt: parisDayEnd(end),
  };
}

/** OCR 返回 "YYYY-MM-DD" → new Date(...) 得到的是 UTC 午夜 */
const ocrDate = (ymd: string) => new Date(ymd);

describe('isDateWithinReservation', () => {
  const r = reservation({ start: '2026-01-01', end: '2026-01-03' });

  it('包含起始日(闭区间左端)', () => {
    expect(isDateWithinReservation(ocrDate('2026-01-01'), r)).toBe(true);
  });
  it('包含结束日(闭区间右端)', () => {
    expect(isDateWithinReservation(ocrDate('2026-01-03'), r)).toBe(true);
  });
  it('区间中间', () => {
    expect(isDateWithinReservation(ocrDate('2026-01-02'), r)).toBe(true);
  });
  it('前一天不在区间', () => {
    expect(isDateWithinReservation(ocrDate('2025-12-31'), r)).toBe(false);
  });
  it('后一天不在区间', () => {
    expect(isDateWithinReservation(ocrDate('2026-01-04'), r)).toBe(false);
  });
  it('单日预约:同一天匹配', () => {
    const single = reservation({ start: '2026-07-14', end: '2026-07-14' });
    expect(isDateWithinReservation(ocrDate('2026-07-14'), single)).toBe(true);
    expect(isDateWithinReservation(ocrDate('2026-07-15'), single)).toBe(false);
  });
  it('按巴黎日期比较:巴黎 7月14日 23:30 的时刻仍算 7月14日', () => {
    const single = reservation({ start: '2026-07-14', end: '2026-07-14' });
    // 巴黎夏令时 UTC+2:2026-07-14T21:30Z = 巴黎 23:30
    expect(isDateWithinReservation(new Date('2026-07-14T21:30:00Z'), single)).toBe(true);
    // 2026-07-14T22:30Z = 巴黎 7月15日 00:30 → 不算
    expect(isDateWithinReservation(new Date('2026-07-14T22:30:00Z'), single)).toBe(false);
  });
});

describe('findMatchingReservation', () => {
  it('商家不匹配 → null', () => {
    const rs = [reservation({ start: '2026-01-01', end: '2026-01-03', merchantId: OTHER_MERCHANT_ID })];
    expect(findMatchingReservation(ocrDate('2026-01-02'), MERCHANT.id, rs)).toBeNull();
  });
  it('PENDING 预约不参与匹配', () => {
    const rs = [reservation({ start: '2026-01-01', end: '2026-01-03', status: 'PENDING' })];
    expect(findMatchingReservation(ocrDate('2026-01-02'), MERCHANT.id, rs)).toBeNull();
  });
  it('REJECTED 预约不参与匹配', () => {
    const rs = [reservation({ start: '2026-01-01', end: '2026-01-03', status: 'REJECTED' })];
    expect(findMatchingReservation(ocrDate('2026-01-02'), MERCHANT.id, rs)).toBeNull();
  });
  it('CANCELLED 预约不参与匹配', () => {
    const rs = [reservation({ start: '2026-01-01', end: '2026-01-03', status: 'CANCELLED' })];
    expect(findMatchingReservation(ocrDate('2026-01-02'), MERCHANT.id, rs)).toBeNull();
  });
  it('多条候选取开始日最早的一条', () => {
    const rs = [
      reservation({ id: 'later', start: '2026-01-02', end: '2026-01-05' }),
      reservation({ id: 'earlier', start: '2026-01-01', end: '2026-01-03' }),
    ];
    expect(findMatchingReservation(ocrDate('2026-01-02'), MERCHANT.id, rs)?.id).toBe('earlier');
  });
});

describe('evaluateInvoiceMatch', () => {
  const accepted = reservation({ id: 'r_ok', start: '2026-01-01', end: '2026-01-03' });

  it('时间在区间 + 商家匹配 + ACCEPTED → 匹配成功', () => {
    const out = evaluateInvoiceMatch({
      purchaseDate: ocrDate('2026-01-02'),
      siret: SIRET,
      merchant: MERCHANT,
      reservations: [accepted],
    });
    expect(out).toEqual({ matched: true, reservationId: 'r_ok', merchantId: MERCHANT.id, rejectReason: null });
  });

  it('时间不在区间 → 拒绝,原因"非预约时间/商铺购物不予返点"', () => {
    const out = evaluateInvoiceMatch({
      purchaseDate: ocrDate('2026-01-04'),
      siret: SIRET,
      merchant: MERCHANT,
      reservations: [accepted],
    });
    expect(out.matched).toBe(false);
    expect(out.rejectReason).toBe(REJECT_REASON_NO_RESERVATION);
    expect(out.merchantId).toBe(MERCHANT.id);
    expect(out.reservationId).toBeNull();
  });

  it('商家不匹配(预约在别家) → 拒绝', () => {
    const out = evaluateInvoiceMatch({
      purchaseDate: ocrDate('2026-01-02'),
      siret: SIRET,
      merchant: MERCHANT,
      reservations: [reservation({ start: '2026-01-01', end: '2026-01-03', merchantId: OTHER_MERCHANT_ID })],
    });
    expect(out.matched).toBe(false);
    expect(out.rejectReason).toBe(REJECT_REASON_NO_RESERVATION);
  });

  it('税号有效但库里没有该商家 → 拒绝,"非预约时间/商铺购物不予返点"', () => {
    const out = evaluateInvoiceMatch({
      purchaseDate: ocrDate('2026-01-02'),
      siret: SIRET,
      merchant: null,
      reservations: [],
    });
    expect(out.matched).toBe(false);
    expect(out.rejectReason).toBe(REJECT_REASON_NO_RESERVATION);
    expect(out.merchantId).toBeNull();
  });

  it('没有任何 ACCEPTED 预约(只有 PENDING)→ 拒绝', () => {
    const out = evaluateInvoiceMatch({
      purchaseDate: ocrDate('2026-01-02'),
      siret: SIRET,
      merchant: MERCHANT,
      reservations: [reservation({ start: '2026-01-01', end: '2026-01-03', status: 'PENDING' })],
    });
    expect(out.matched).toBe(false);
    expect(out.rejectReason).toBe(REJECT_REASON_NO_RESERVATION);
  });

  it('取消的预约不参与匹配 → 拒绝', () => {
    const out = evaluateInvoiceMatch({
      purchaseDate: ocrDate('2026-01-02'),
      siret: SIRET,
      merchant: MERCHANT,
      reservations: [reservation({ start: '2026-01-01', end: '2026-01-03', status: 'CANCELLED' })],
    });
    expect(out.matched).toBe(false);
    expect(out.rejectReason).toBe(REJECT_REASON_NO_RESERVATION);
  });

  it('后台拒绝的预约不参与匹配 → 拒绝', () => {
    const out = evaluateInvoiceMatch({
      purchaseDate: ocrDate('2026-01-02'),
      siret: SIRET,
      merchant: MERCHANT,
      reservations: [reservation({ start: '2026-01-01', end: '2026-01-03', status: 'REJECTED' })],
    });
    expect(out.matched).toBe(false);
    expect(out.rejectReason).toBe(REJECT_REASON_NO_RESERVATION);
  });

  it('税号提取失败(null)→ 拒绝,原因"照片不清晰"', () => {
    const out = evaluateInvoiceMatch({
      purchaseDate: ocrDate('2026-01-02'),
      siret: null,
      merchant: null,
      reservations: [],
    });
    expect(out.matched).toBe(false);
    expect(out.rejectReason).toBe(REJECT_REASON_UNREADABLE);
  });

  it('购买日期提取失败 → 拒绝,原因"照片不清晰"', () => {
    const out = evaluateInvoiceMatch({
      purchaseDate: null,
      siret: SIRET,
      merchant: MERCHANT,
      reservations: [accepted],
    });
    expect(out.matched).toBe(false);
    expect(out.rejectReason).toBe(REJECT_REASON_UNREADABLE);
  });

  it('同商家取消一条、另一条 ACCEPTED 覆盖 → 仍匹配到 ACCEPTED 的那条', () => {
    const out = evaluateInvoiceMatch({
      purchaseDate: ocrDate('2026-01-02'),
      siret: SIRET,
      merchant: MERCHANT,
      reservations: [
        reservation({ id: 'cancelled', start: '2026-01-01', end: '2026-01-03', status: 'CANCELLED' }),
        reservation({ id: 'live', start: '2026-01-02', end: '2026-01-02', status: 'ACCEPTED' }),
      ],
    });
    expect(out).toMatchObject({ matched: true, reservationId: 'live' });
  });
});
