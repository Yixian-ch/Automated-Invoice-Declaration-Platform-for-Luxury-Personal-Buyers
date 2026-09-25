import { arithmeticFailReason, checkArithmetic, isArithmeticReason, normalizeReviewReasons } from './ocr-normalize';

describe('normalizeReviewReasons', () => {
  it('数组原样(去空)', () => {
    expect(normalizeReviewReasons(['a', ' b ', '', null])).toEqual(['a', 'b']);
  });
  it('对象 → 每个键一条', () => {
    expect(
      normalizeReviewReasons({
        lineTotalSumMismatch: { calculatedSum: 11150, printedTotal: 11360 },
        quantityDescriptionMismatch: true,
        note: 'x',
      }),
    ).toEqual([
      'lineTotalSumMismatch: {"calculatedSum":11150,"printedTotal":11360}',
      'quantityDescriptionMismatch',
      'note: x',
    ]);
  });
  it('字符串 / 空值 / 布尔值', () => {
    expect(normalizeReviewReasons('blurry')).toEqual(['blurry']);
    expect(normalizeReviewReasons('')).toEqual([]);
    expect(normalizeReviewReasons(undefined)).toEqual([]);
    expect(normalizeReviewReasons(null)).toEqual([]);
    expect(normalizeReviewReasons(false)).toEqual([]);
    expect(normalizeReviewReasons(true)).toEqual([]);
    expect(normalizeReviewReasons([true, 'x'])).toEqual(['x']);
  });
  it('对象里值为 false/null 的键表示"没这个问题",跳过', () => {
    expect(normalizeReviewReasons({ blurry: false, missingDate: null, cutOff: true })).toEqual(['cutOff']);
  });
});

describe('isArithmeticReason', () => {
  it('只识别明细合计类理由', () => {
    expect(isArithmeticReason('lineTotalSumMismatch: {"calculatedSum":11150}')).toBe(true);
    expect(isArithmeticReason('明细合计 1 与总额 2 不符')).toBe(true);
    expect(isArithmeticReason('quantityDescriptionMismatch: {...}')).toBe(false);
    expect(isArithmeticReason('SIRET mismatch with barcode')).toBe(false);
    expect(isArithmeticReason('grandTotal digits partially obscured')).toBe(false);
  });
});

describe('checkArithmetic', () => {
  const items = [390, 750, 1590, 2950, 1380, 3900, 400].map((amount_ttc) => ({ amount_ttc }));

  it('样票 7 行合计 11360 = 总额 → pass(模型自己算成 11150 是错的)', () => {
    expect(checkArithmetic(items, 11360)).toEqual({ check: 'pass', lineSum: 11360, discrepancy: 0 });
  });
  it('差 0.5 以内容忍(四舍五入)', () => {
    expect(checkArithmetic([{ amount_ttc: 10.2 }, { amount_ttc: 5.1 }], 15.5).check).toBe('pass');
  });
  it('差超过容差 → fail 并给出差额', () => {
    const r = checkArithmetic(items, 11150);
    expect(r).toEqual({ check: 'fail', lineSum: 11360, discrepancy: 210 });
    expect(arithmeticFailReason(r, 11150)).toBe('明细合计 11360.00 与总额 11150.00 不符(差 210.00)');
  });
  it('没有总额或没有明细 → skipped;明确要求跳过(JSON 截断)→ skipped', () => {
    expect(checkArithmetic(items, null).check).toBe('skipped');
    expect(checkArithmetic([], 100).check).toBe('skipped');
    expect(checkArithmetic(items, 5680, { skip: true }).check).toBe('skipped');
  });
  it('amount_ttc 是单价时按 单价×数量 也能通过', () => {
    const unitPriced = [{ quantity: 2, amount_ttc: 1380 }, { quantity: 1, amount_ttc: 134 }];
    expect(checkArithmetic(unitPriced, 2894)).toEqual({ check: 'pass', lineSum: 2894, discrepancy: 0 });
    // 行合计口径也通过
    expect(checkArithmetic(unitPriced, 1514).check).toBe('pass');
  });
});
