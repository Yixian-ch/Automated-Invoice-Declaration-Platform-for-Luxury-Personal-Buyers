/**
 * 自动审核流水线集成测试(Prisma 用内存假对象替代)。
 * 覆盖:执行顺序、去重范围(全局/非拒绝)、批内重复逐张处理、条形码失败、跨用户标记。
 */
import { InvoiceStatus } from '@prisma/client';
import { AutoReviewService } from './auto-review.service';
import {
  REJECT_REASON_DUPLICATE,
  REJECT_REASON_UNCLEAR_PHOTO,
  REVIEW_REASON_CROSS_USER_DUPLICATE,
} from './auto-review.rules';
import { REJECT_REASON_NO_RESERVATION } from '../reservation/reservation-matcher';
import { parisDayEnd, parisDayStart } from '../reservation/paris-time';

const SIRET = '53775858300059';
const MERCHANT_ID = 'm_samaritaine';
const BARCODE = '25020582499619654879';

type FakeInvoice = { id: string; userId: string; invoiceNumber: string | null; status: InvoiceStatus; deletedAt: Date | null; createdAt: Date };

/** 极简内存版 Prisma:只实现流水线用到的三个查询 */
function fakePrisma(state: {
  invoices: FakeInvoice[];
  merchants: { id: string; taxId: string }[];
  reservations: { id: string; userId: string; merchantId: string; status: string; startAt: Date; endAt: Date }[];
}) {
  return {
    invoice: {
      findMany: async ({ where }: any) =>
        state.invoices
          .filter((i) => i.invoiceNumber === where.invoiceNumber)
          .filter((i) => i.id !== where.id.not)
          .filter((i) => i.status !== where.status.not)
          .filter((i) => i.deletedAt === null)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map((i) => ({ id: i.id, userId: i.userId })),
    },
    merchant: {
      findUnique: async ({ where }: any) => {
        const m = state.merchants.find((x) => x.taxId === where.taxId);
        return m ? { id: m.id } : null;
      },
    },
    reservation: {
      findMany: async ({ where }: any) =>
        state.reservations
          .filter((r) => r.userId === where.userId && r.merchantId === where.merchantId)
          .map(({ id, merchantId, status, startAt, endAt }) => ({ id, merchantId, status, startAt, endAt })),
    },
  } as any;
}

const fakeConfig = (threshold?: string) => ({ get: () => threshold }) as any;

function acceptedReservation(userId: string, start: string, end: string, id = `r_${userId}`) {
  return { id, userId, merchantId: MERCHANT_ID, status: 'ACCEPTED', startAt: parisDayStart(start), endAt: parisDayEnd(end) };
}

const goodInput = (invoiceId: string, userId: string, overrides: Partial<Parameters<AutoReviewService['review']>[0]> = {}) => ({
  invoiceId,
  userId,
  imageQuality: 0.9,
  barcode: BARCODE,
  merchantTaxId: SIRET,
  purchaseDate: new Date('2026-01-02'),
  ...overrides,
});

function makeState() {
  return {
    invoices: [] as FakeInvoice[],
    merchants: [{ id: MERCHANT_ID, taxId: SIRET }],
    reservations: [acceptedReservation('user_a', '2026-01-01', '2026-01-03'), acceptedReservation('user_b', '2026-01-01', '2026-01-03')],
  };
}

describe('AutoReviewService.review', () => {
  it('全部通过 → PENDING,带预约与商家', async () => {
    const svc = new AutoReviewService(fakePrisma(makeState()), fakeConfig());
    const out = await svc.review(goodInput('inv_1', 'user_a'));
    expect(out).toMatchObject({
      status: InvoiceStatus.PENDING,
      rejectedBy: null,
      rejectReason: null,
      reservationId: 'r_user_a',
      matchedMerchantId: MERCHANT_ID,
      barcode: BARCODE,
      siret: SIRET,
      needsReview: false,
    });
  });

  it('顺序:置信度先于去重 — 模糊照片即使条形码重复也按"照片不清晰"拒', async () => {
    const state = makeState();
    state.invoices.push({ id: 'inv_0', userId: 'user_a', invoiceNumber: BARCODE, status: InvoiceStatus.PENDING, deletedAt: null, createdAt: new Date() });
    const svc = new AutoReviewService(fakePrisma(state), fakeConfig());
    const out = await svc.review(goodInput('inv_1', 'user_a', { imageQuality: 0.5 }));
    expect(out).toMatchObject({ status: InvoiceStatus.REJECTED, rejectedBy: 'confidence', rejectReason: REJECT_REASON_UNCLEAR_PHOTO });
  });

  it('顺序:去重先于预约匹配 — 重复的小票即使没有预约也按"重复提交"拒', async () => {
    const state = makeState();
    state.reservations = [];
    state.invoices.push({ id: 'inv_0', userId: 'user_a', invoiceNumber: BARCODE, status: InvoiceStatus.PENDING, deletedAt: null, createdAt: new Date() });
    const svc = new AutoReviewService(fakePrisma(state), fakeConfig());
    const out = await svc.review(goodInput('inv_1', 'user_a'));
    expect(out).toMatchObject({ status: InvoiceStatus.REJECTED, rejectedBy: 'duplicate', rejectReason: REJECT_REASON_DUPLICATE });
  });

  it('条形码提取失败 → 拒绝"照片不清晰",不进去重', async () => {
    const svc = new AutoReviewService(fakePrisma(makeState()), fakeConfig());
    const out = await svc.review(goodInput('inv_1', 'user_a', { barcode: null }));
    expect(out).toMatchObject({ status: InvoiceStatus.REJECTED, rejectedBy: 'confidence', rejectReason: REJECT_REASON_UNCLEAR_PHOTO });
    expect(out.barcode).toBeNull();
  });

  it('阈值来自配置:OCR_MIN_CONFIDENCE=0.9 时 0.85 拒绝', async () => {
    const svc = new AutoReviewService(fakePrisma(makeState()), fakeConfig('0.9'));
    expect(svc.confidenceThreshold).toBe(0.9);
    const out = await svc.review(goodInput('inv_1', 'user_a', { imageQuality: 0.85 }));
    expect(out.rejectedBy).toBe('confidence');
  });

  it('同用户与已拒绝小票同号 → 不算重复(已拒绝记录不占用编号)', async () => {
    const state = makeState();
    state.invoices.push({ id: 'inv_old', userId: 'user_a', invoiceNumber: BARCODE, status: InvoiceStatus.REJECTED, deletedAt: null, createdAt: new Date() });
    const svc = new AutoReviewService(fakePrisma(state), fakeConfig());
    const out = await svc.review(goodInput('inv_1', 'user_a'));
    expect(out.status).toBe(InvoiceStatus.PENDING);
    expect(out.rejectedBy).toBeNull();
  });

  it.each([
    InvoiceStatus.PENDING,
    InvoiceStatus.AWAITING_CONFIRMATION,
    InvoiceStatus.DISPUTED,
    InvoiceStatus.CONFIRMED,
    InvoiceStatus.APPROVED,
  ])('同用户与 %s 状态的小票同号 → 拒绝"小票重复提交"', async (status) => {
    const state = makeState();
    state.invoices.push({ id: 'inv_old', userId: 'user_a', invoiceNumber: BARCODE, status, deletedAt: null, createdAt: new Date() });
    const svc = new AutoReviewService(fakePrisma(state), fakeConfig());
    const out = await svc.review(goodInput('inv_1', 'user_a'));
    expect(out).toMatchObject({ status: InvoiceStatus.REJECTED, rejectedBy: 'duplicate', rejectReason: REJECT_REASON_DUPLICATE });
    expect(out.fraudFlags).toMatchObject({ duplicateBarcode: { invoiceId: 'inv_old', sameUser: true } });
  });

  it('跨用户撞号 → 不拒绝,转人工并标记风控', async () => {
    const state = makeState();
    state.invoices.push({ id: 'inv_b', userId: 'user_b', invoiceNumber: BARCODE, status: InvoiceStatus.PENDING, deletedAt: null, createdAt: new Date() });
    const svc = new AutoReviewService(fakePrisma(state), fakeConfig());
    const out = await svc.review(goodInput('inv_1', 'user_a'));
    expect(out.status).toBe(InvoiceStatus.PENDING);
    expect(out.needsReview).toBe(true);
    expect(out.reviewReasons).toEqual([REVIEW_REASON_CROSS_USER_DUPLICATE]);
    expect(out.fraudFlags).toEqual({
      duplicateBarcode: { sameUser: false, invoices: [{ invoiceId: 'inv_b', userId: 'user_b' }] },
    });
    expect(out.reservationId).toBe('r_user_a');
  });

  it('跨用户撞号但对方已被拒绝 → 不标记', async () => {
    const state = makeState();
    state.invoices.push({ id: 'inv_b', userId: 'user_b', invoiceNumber: BARCODE, status: InvoiceStatus.REJECTED, deletedAt: null, createdAt: new Date() });
    const svc = new AutoReviewService(fakePrisma(state), fakeConfig());
    const out = await svc.review(goodInput('inv_1', 'user_a'));
    expect(out.needsReview).toBe(false);
    expect(out.fraudFlags).toBeNull();
  });

  it('无匹配预约 → 拒绝"非预约时间/商铺购物不予返点"', async () => {
    const state = makeState();
    state.reservations = [];
    const svc = new AutoReviewService(fakePrisma(state), fakeConfig());
    const out = await svc.review(goodInput('inv_1', 'user_a'));
    expect(out).toMatchObject({ status: InvoiceStatus.REJECTED, rejectedBy: 'reservation', rejectReason: REJECT_REASON_NO_RESERVATION, matchedMerchantId: MERCHANT_ID });
  });

  it('批量上传含重复:逐张处理,首张有效、重复的单独拒绝、不牵连整批', async () => {
    const state = makeState();
    const svc = new AutoReviewService(fakePrisma(state), fakeConfig());

    // 同一批 4 张:A、A(重复)、B、C
    const batch = [
      { id: 'inv_1', barcode: BARCODE },
      { id: 'inv_2', barcode: BARCODE },
      { id: 'inv_3', barcode: '25020582499619650001' },
      { id: 'inv_4', barcode: '25020582499619650002' },
    ];
    const results: Record<string, InvoiceStatus> = {};
    for (const item of batch) {
      // 模拟处理器:先建 PENDING 记录(尚无条形码),审核后落库
      state.invoices.push({ id: item.id, userId: 'user_a', invoiceNumber: null, status: InvoiceStatus.PENDING, deletedAt: null, createdAt: new Date() });
      const out = await svc.review(goodInput(item.id, 'user_a', { barcode: item.barcode }));
      const row = state.invoices.find((i) => i.id === item.id)!;
      row.status = out.status;
      row.invoiceNumber = out.barcode ?? item.barcode;
      results[item.id] = out.status;
    }

    expect(results).toEqual({
      inv_1: InvoiceStatus.PENDING,
      inv_2: InvoiceStatus.REJECTED,
      inv_3: InvoiceStatus.PENDING,
      inv_4: InvoiceStatus.PENDING,
    });
  });

  it('客户因照片模糊被拒后重拍同一张 → 不被判为重复(不会死循环)', async () => {
    const state = makeState();
    const svc = new AutoReviewService(fakePrisma(state), fakeConfig());

    // 第一次:模糊 → 拒绝,但条形码已存下
    state.invoices.push({ id: 'inv_blur', userId: 'user_a', invoiceNumber: null, status: InvoiceStatus.PENDING, deletedAt: null, createdAt: new Date() });
    const first = await svc.review(goodInput('inv_blur', 'user_a', { imageQuality: 0.4 }));
    const row = state.invoices.find((i) => i.id === 'inv_blur')!;
    row.status = first.status;
    row.invoiceNumber = BARCODE;
    expect(first.status).toBe(InvoiceStatus.REJECTED);

    // 第二次:清晰重拍 → 通过
    state.invoices.push({ id: 'inv_retry', userId: 'user_a', invoiceNumber: null, status: InvoiceStatus.PENDING, deletedAt: null, createdAt: new Date() });
    const second = await svc.review(goodInput('inv_retry', 'user_a'));
    expect(second.status).toBe(InvoiceStatus.PENDING);
  });
});
