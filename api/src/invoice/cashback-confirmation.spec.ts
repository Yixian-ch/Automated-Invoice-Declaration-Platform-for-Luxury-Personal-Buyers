import { InvoiceStatus } from '@prisma/client';
import {
  ConfirmationError,
  applyConfirm,
  applyDispute,
  assertAmountEditable,
  assertCanApprove,
  assertCanConfirm,
  assertCanDispute,
  assertCanReject,
  assertCanResolveDispute,
  isAmountLocked,
} from './cashback-confirmation';

const inv = (status: InvoiceStatus, extra: Partial<{ cashbackAmount: number | null; disputeCount: number }> = {}) => ({
  status,
  cashbackAmount: extra.cashbackAmount === undefined ? 123.45 : extra.cashbackAmount,
  disputeCount: extra.disputeCount ?? 0,
});

const DISPUTE = { category: 'AMOUNT_WRONG', note: '返点比例不对' };

describe('金额锁定(CONFIRMED)', () => {
  it('CONFIRMED 后修改金额被拒(409)', () => {
    expect(isAmountLocked(inv(InvoiceStatus.CONFIRMED))).toBe(true);
    expect(() => assertAmountEditable(inv(InvoiceStatus.CONFIRMED))).toThrow(ConfirmationError);
    try {
      assertAmountEditable(inv(InvoiceStatus.CONFIRMED));
    } catch (e) {
      expect((e as ConfirmationError).kind).toBe('conflict');
    }
  });

  it('其他状态可以修改', () => {
    for (const s of [InvoiceStatus.PENDING, InvoiceStatus.AWAITING_CONFIRMATION, InvoiceStatus.DISPUTED, InvoiceStatus.REJECTED]) {
      expect(() => assertAmountEditable(inv(s))).not.toThrow();
    }
  });

  it('CONFIRMED 后后台"通过"/"拒绝"都被拒', () => {
    expect(() => assertCanApprove(inv(InvoiceStatus.CONFIRMED))).toThrow(/锁定/);
    expect(() => assertCanReject(inv(InvoiceStatus.CONFIRMED))).toThrow(/锁定/);
  });
});

describe('客户确认', () => {
  it('AWAITING_CONFIRMATION → CONFIRMED,写入 confirmedAt', () => {
    const now = new Date('2026-02-01T10:00:00Z');
    expect(applyConfirm(inv(InvoiceStatus.AWAITING_CONFIRMATION), now)).toEqual({
      status: InvoiceStatus.CONFIRMED,
      confirmedAt: now,
    });
  });

  it('已 CONFIRMED 再确认 → 409', () => {
    expect(() => assertCanConfirm(inv(InvoiceStatus.CONFIRMED))).toThrow(/已确认/);
  });

  it('不在待确认状态(PENDING/DISPUTED/REJECTED)→ 400', () => {
    for (const s of [InvoiceStatus.PENDING, InvoiceStatus.DISPUTED, InvoiceStatus.REJECTED]) {
      expect(() => assertCanConfirm(inv(s))).toThrow(/不在待确认状态/);
    }
  });

  it('没有返点金额 → 400', () => {
    expect(() => assertCanConfirm(inv(InvoiceStatus.AWAITING_CONFIRMATION, { cashbackAmount: 0 }))).toThrow(/没有可确认/);
    expect(() => assertCanConfirm(inv(InvoiceStatus.AWAITING_CONFIRMATION, { cashbackAmount: null }))).toThrow(/没有可确认/);
  });
});

describe('客户异议', () => {
  it('AWAITING_CONFIRMATION → DISPUTED,disputeCount+1,记录原因与金额快照,回人工队列', () => {
    const now = new Date('2026-02-01T10:00:00Z');
    expect(applyDispute(inv(InvoiceStatus.AWAITING_CONFIRMATION, { disputeCount: 1 }), { ...DISPUTE, note: '  返点比例不对 ' }, now)).toEqual({
      status: InvoiceStatus.DISPUTED,
      disputedAt: now,
      disputeCategory: 'AMOUNT_WRONG',
      disputeReason: '返点比例不对',
      disputeCount: 2,
      disputedAmount: 123.45,
      needsReview: true,
    });
  });

  it('CONFIRMED 后发起 dispute 被拒(409)', () => {
    expect(() => assertCanDispute(inv(InvoiceStatus.CONFIRMED), DISPUTE)).toThrow(/不可再提出异议/);
  });

  it('非待确认状态不能发起', () => {
    expect(() => assertCanDispute(inv(InvoiceStatus.DISPUTED), DISPUTE)).toThrow(/无法提出异议/);
    expect(() => assertCanDispute(inv(InvoiceStatus.PENDING), DISPUTE)).toThrow(/无法提出异议/);
  });

  it('异议原因分类未选 / 不合法 → 400', () => {
    expect(() => assertCanDispute(inv(InvoiceStatus.AWAITING_CONFIRMATION), { category: '', note: 'x' })).toThrow(/请选择异议原因/);
    expect(() => assertCanDispute(inv(InvoiceStatus.AWAITING_CONFIRMATION), { category: 'WHATEVER', note: 'x' })).toThrow(/请选择异议原因/);
  });

  it('异议说明未填(空或全空白)→ 400', () => {
    expect(() => assertCanDispute(inv(InvoiceStatus.AWAITING_CONFIRMATION), { category: 'OTHER', note: '' })).toThrow(/请填写异议说明/);
    expect(() => assertCanDispute(inv(InvoiceStatus.AWAITING_CONFIRMATION), { category: 'OTHER', note: '   ' })).toThrow(/请填写异议说明/);
  });

  it('不限制异议次数:disputeCount 已 5 次仍可发起', () => {
    expect(() => assertCanDispute(inv(InvoiceStatus.AWAITING_CONFIRMATION, { disputeCount: 5 }), DISPUTE)).not.toThrow();
  });
});

describe('后台处理异议', () => {
  it('DISPUTED 不能走普通"通过",必须走复核流程', () => {
    expect(() => assertCanApprove(inv(InvoiceStatus.DISPUTED))).toThrow(/处理异议/);
    expect(() => assertCanApprove(inv(InvoiceStatus.PENDING))).not.toThrow();
    expect(() => assertCanApprove(inv(InvoiceStatus.AWAITING_CONFIRMATION))).toThrow(/只有待审核/);
  });

  it('ConfirmationError 直接携带 HTTP 状态码', () => {
    try {
      assertCanApprove(inv(InvoiceStatus.CONFIRMED));
    } catch (e) {
      expect((e as ConfirmationError).getStatus()).toBe(409);
    }
    try {
      assertCanApprove(inv(InvoiceStatus.DISPUTED));
    } catch (e) {
      expect((e as ConfirmationError).getStatus()).toBe(400);
    }
  });

  it('维持原金额时必须填复核说明', () => {
    expect(() => assertCanResolveDispute(inv(InvoiceStatus.DISPUTED), { amountChanged: false, note: '' })).toThrow(/复核说明/);
    expect(() => assertCanResolveDispute(inv(InvoiceStatus.DISPUTED), { amountChanged: false, note: '   ' })).toThrow(/复核说明/);
    expect(() => assertCanResolveDispute(inv(InvoiceStatus.DISPUTED), { amountChanged: false, note: '按规则复核无误' })).not.toThrow();
  });

  it('金额已修正时说明可以不填', () => {
    expect(() => assertCanResolveDispute(inv(InvoiceStatus.DISPUTED), { amountChanged: true, note: undefined })).not.toThrow();
  });

  it('只有 DISPUTED 可以复核', () => {
    for (const s of [InvoiceStatus.PENDING, InvoiceStatus.AWAITING_CONFIRMATION, InvoiceStatus.CONFIRMED]) {
      expect(() => assertCanResolveDispute(inv(s), { amountChanged: true, note: 'x' })).toThrow(/只有金额异议中/);
    }
  });
});
