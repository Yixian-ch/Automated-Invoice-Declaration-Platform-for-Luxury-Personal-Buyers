import {
  REASON_MODEL_BARE_FLAG,
  REASON_TRUNCATED,
  arithmeticFailReason,
  checkArithmetic,
  isArithmeticReason,
  looseBool,
  mergeReviewReasons,
  normalizeReviewReasons,
} from './ocr-normalize';

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
    expect(isArithmeticReason('description: The sum of the line items (11750.00) does not match the grand total amount')).toBe(true);
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

describe('mergeReviewReasons', () => {
  const pass = { check: 'pass' as const, lineSum: 11360, discrepancy: 0 };
  const fail = { check: 'fail' as const, lineSum: 11360, discrepancy: -140 };
  const skipped = { check: 'skipped' as const, lineSum: null, discrepancy: null };
  const modelSumComplaint = { lineTotalSumMismatch: { calculatedSum: 11750 }, description: 'The sum of the line items does not match the grand total' };

  it('模型算错合计、服务端验证通过 → 不标记,理由为空(样票场景)', () => {
    expect(mergeReviewReasons({ modelReviewReasons: modelSumComplaint, modelNeedsReview: true, arithmetic: pass, grandTotal: 11360, repaired: false }))
      .toEqual({ needsReview: false, reviewReasons: [] });
  });

  it('模型算错合计、服务端无法验证(skipped)→ 仍标记(裸 needsReview 生效)', () => {
    expect(mergeReviewReasons({ modelReviewReasons: modelSumComplaint, modelNeedsReview: true, arithmetic: skipped, grandTotal: undefined, repaired: false }))
      .toEqual({ needsReview: true, reviewReasons: [REASON_MODEL_BARE_FLAG] });
  });

  it('服务端算术失败 → 只有服务端的理由,不带模型的错误合计数字', () => {
    const r = mergeReviewReasons({ modelReviewReasons: modelSumComplaint, modelNeedsReview: true, arithmetic: fail, grandTotal: 11500, repaired: false });
    expect(r.needsReview).toBe(true);
    expect(r.reviewReasons).toEqual([arithmeticFailReason(fail, 11500)]);
  });

  it('模型的非算术理由原样保留', () => {
    const r = mergeReviewReasons({ modelReviewReasons: ['grand total digits partially obscured', 'quantityDescriptionMismatch'], modelNeedsReview: true, arithmetic: pass, grandTotal: 100, repaired: false });
    expect(r.reviewReasons).toEqual(['grand total digits partially obscured', 'quantityDescriptionMismatch']);
  });

  it('模型只给 needsReview(true 或 "true")没给理由 → 补通用理由', () => {
    expect(mergeReviewReasons({ modelReviewReasons: [], modelNeedsReview: true, arithmetic: pass, grandTotal: 100, repaired: false }).reviewReasons).toEqual([REASON_MODEL_BARE_FLAG]);
    expect(mergeReviewReasons({ modelReviewReasons: undefined, modelNeedsReview: 'true', arithmetic: pass, grandTotal: 100, repaired: false }).needsReview).toBe(true);
    expect(looseBool('TRUE')).toBe(true);
    expect(looseBool(false)).toBe(false);
  });

  it('JSON 修复过 → 截断理由', () => {
    expect(mergeReviewReasons({ modelReviewReasons: [], modelNeedsReview: false, arithmetic: skipped, grandTotal: 100, repaired: true }))
      .toEqual({ needsReview: true, reviewReasons: [REASON_TRUNCATED] });
  });

  it('什么问题都没有 → 不标记', () => {
    expect(mergeReviewReasons({ modelReviewReasons: [], modelNeedsReview: false, arithmetic: pass, grandTotal: 100, repaired: false }))
      .toEqual({ needsReview: false, reviewReasons: [] });
  });
});
