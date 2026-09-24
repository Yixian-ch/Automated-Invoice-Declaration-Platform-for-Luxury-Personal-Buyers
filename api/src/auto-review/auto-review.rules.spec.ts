import {
  checkConfidence,
  checkDuplicate,
  normalizeBarcode,
  normalizeUnitScore,
  parseConfidenceThreshold,
  REJECT_REASON_DUPLICATE,
  REJECT_REASON_UNCLEAR_PHOTO,
  REVIEW_REASON_CROSS_USER_DUPLICATE,
} from './auto-review.rules';

const GOOD = {
  imageQuality: 0.95,
  barcode: '25020582499619654879',
  merchantTaxId: '53775858300059',
  purchaseDate: new Date('2026-01-02'),
};

describe('规则 1:checkConfidence(阈值 0.8)', () => {
  it('置信度 = 80% 放行', () => {
    const r = checkConfidence({ ...GOOD, imageQuality: 0.8 }, 0.8);
    expect(r.ok).toBe(true);
  });

  it('置信度 79.9% 拒绝,文案为邀请重传', () => {
    const r = checkConfidence({ ...GOOD, imageQuality: 0.799 }, 0.8);
    expect(r).toMatchObject({ ok: false, rejectReason: REJECT_REASON_UNCLEAR_PHOTO, failedChecks: ['imageQuality'] });
  });

  it('置信度缺失时不单独否决', () => {
    expect(checkConfidence({ ...GOOD, imageQuality: undefined }, 0.8).ok).toBe(true);
    expect(checkConfidence({ ...GOOD, imageQuality: null }, 0.8).ok).toBe(true);
  });

  it('条形码提取失败 → 拒绝(照片不清晰)', () => {
    const r = checkConfidence({ ...GOOD, barcode: null }, 0.8);
    expect(r).toMatchObject({ ok: false, rejectReason: REJECT_REASON_UNCLEAR_PHOTO, failedChecks: ['barcode'] });
  });

  it('SIRET 提取失败或 Luhn 不过 → 拒绝(照片不清晰)', () => {
    expect(checkConfidence({ ...GOOD, merchantTaxId: null }, 0.8)).toMatchObject({ ok: false, failedChecks: ['siret'] });
    expect(checkConfidence({ ...GOOD, merchantTaxId: '53775858300058' }, 0.8)).toMatchObject({ ok: false, failedChecks: ['siret'] });
  });

  it('购买日期提取失败 → 拒绝(照片不清晰)', () => {
    expect(checkConfidence({ ...GOOD, purchaseDate: null }, 0.8)).toMatchObject({ ok: false, failedChecks: ['purchaseDate'] });
    expect(checkConfidence({ ...GOOD, purchaseDate: new Date('nope') }, 0.8)).toMatchObject({ ok: false, failedChecks: ['purchaseDate'] });
  });

  it('多项不可读时全部列出', () => {
    const r = checkConfidence({ imageQuality: 0.3, barcode: '', merchantTaxId: '', purchaseDate: null }, 0.8);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failedChecks).toEqual(['imageQuality', 'barcode', 'siret', 'purchaseDate']);
  });

  it('通过时返回规范化后的条形码与 SIRET', () => {
    const r = checkConfidence({ ...GOOD, barcode: '2502 0582 4996 1965 4879', merchantTaxId: '537 758 583 00059' }, 0.8);
    expect(r).toEqual({ ok: true, siret: '53775858300059', barcode: '25020582499619654879' });
  });

  it('阈值可配置:阈值 0.9 时 0.85 拒绝', () => {
    expect(checkConfidence({ ...GOOD, imageQuality: 0.85 }, 0.9).ok).toBe(false);
    expect(checkConfidence({ ...GOOD, imageQuality: 0.85 }, 0.8).ok).toBe(true);
  });
});

describe('normalizeBarcode', () => {
  it('去空白、要求 8 位以上纯数字', () => {
    expect(normalizeBarcode(' 2502 0582 4996 1965 4879 ')).toBe('25020582499619654879');
    expect(normalizeBarcode('N° 15021*04')).toBeNull();
    expect(normalizeBarcode('1234567')).toBeNull();
    expect(normalizeBarcode(null)).toBeNull();
  });
});

describe('parseConfidenceThreshold / normalizeUnitScore', () => {
  it('支持 0.8 / 80 / 空 / 非法', () => {
    expect(parseConfidenceThreshold('0.8')).toBe(0.8);
    expect(parseConfidenceThreshold('80')).toBe(0.8);
    expect(parseConfidenceThreshold('0.75')).toBe(0.75);
    expect(parseConfidenceThreshold(undefined)).toBe(0.8);
    expect(parseConfidenceThreshold('')).toBe(0.8);
    expect(parseConfidenceThreshold('abc')).toBe(0.8);
    expect(parseConfidenceThreshold('-1')).toBe(0.8);
  });

  it('(1, 2) 之间与 >100 视为非法,不会被误当成百分数', () => {
    expect(normalizeUnitScore(1.5)).toBeNull();
    expect(normalizeUnitScore(1.2)).toBeNull();
    expect(normalizeUnitScore(101)).toBeNull();
    expect(normalizeUnitScore(1)).toBe(1);
    expect(normalizeUnitScore(2)).toBe(0.02);
    expect(normalizeUnitScore('95')).toBe(0.95);
    expect(parseConfidenceThreshold('1.5')).toBe(0.8); // 回退默认,不会把阈值降到 0.015
  });
});

describe('规则 2:checkDuplicate', () => {
  const ME = 'user_a';

  it('没有同号活跃小票 → 不重复', () => {
    expect(checkDuplicate(ME, [])).toEqual({ kind: 'none' });
  });

  it('同用户重复 → 拒绝"小票重复提交"', () => {
    const r = checkDuplicate(ME, [{ id: 'inv_1', userId: ME }]);
    expect(r).toEqual({ kind: 'same-user', rejectReason: REJECT_REASON_DUPLICATE, duplicateOf: { id: 'inv_1', userId: ME } });
  });

  it('跨用户撞号 → 不拒绝,转人工并标记', () => {
    const r = checkDuplicate(ME, [{ id: 'inv_2', userId: 'user_b' }]);
    expect(r).toEqual({
      kind: 'cross-user',
      reviewReason: REVIEW_REASON_CROSS_USER_DUPLICATE,
      duplicates: [{ id: 'inv_2', userId: 'user_b' }],
    });
  });

  it('同时有同用户和跨用户撞号 → 按同用户重复拒绝', () => {
    const r = checkDuplicate(ME, [
      { id: 'inv_2', userId: 'user_b' },
      { id: 'inv_1', userId: ME },
    ]);
    expect(r.kind).toBe('same-user');
  });
});
