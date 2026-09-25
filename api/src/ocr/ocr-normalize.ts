/**
 * 模型输出的归一化(纯逻辑,便于单测)。
 *
 * 模型给的 reviewReasons 有时是数组、有时是对象、有时是一句话;
 * 算术自检也不可靠(会算错合计)。这里统一成服务端可信的形式:
 * - reviewReasons 永远是 string[]
 * - 明细合计 vs 总额 由服务端自己算,结果覆盖模型的 arithmeticCheck
 */

/** 明细合计与总额允许的误差(欧元) */
export const ARITHMETIC_TOLERANCE = 0.5;

export function normalizeReviewReasons(raw: unknown): string[] {
  // 布尔值不是"理由":true 只表示"需复核"(由调用方处理),false 表示没问题
  if (raw == null || typeof raw === 'boolean') return [];
  if (typeof raw === 'string') return raw.trim() ? [raw.trim()] : [];
  if (Array.isArray(raw)) {
    return raw
      .map((r) => (typeof r === 'string' ? r.trim() : r == null || typeof r === 'boolean' ? '' : JSON.stringify(r)))
      .filter((r) => r.length > 0);
  }
  if (typeof raw === 'object') {
    // { lineTotalSumMismatch: {...}, blurry: false } → 每个键一条;值为 false/null 的键表示"没这个问题",跳过
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, v]) => v !== false && v != null)
      .map(([k, v]) => (v === true ? k : `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`));
  }
  return [String(raw)];
}

/** 模型的算术类理由(明细合计 vs 总额),服务端自己会算,这类理由以服务端结果为准 */
export function isArithmeticReason(reason: string): boolean {
  return /line\s*total|lineTotal|calculatedSum|sum\s*(of|mismatch)|arithmetic|合计|总额不符/i.test(reason);
}

export interface ArithmeticResult {
  check: 'pass' | 'fail' | 'skipped';
  lineSum: number | null;
  discrepancy: number | null;
}

/**
 * 服务端算术校验:明细合计与 grandTotal 的差在容差内即通过。
 * amount_ttc 有时是行合计、有时是单价,两种口径任一对得上就算通过。
 * options.skip 为 true(如 JSON 被截断、明细已知不完整)→ skipped。
 */
export function checkArithmetic(
  lineItems: { amount_ttc?: number | null; quantity?: number | null }[],
  grandTotal: number | null | undefined,
  options: { skip?: boolean } = {},
): ArithmeticResult {
  if (options.skip || !grandTotal || grandTotal <= 0 || lineItems.length === 0) {
    return { check: 'skipped', lineSum: null, discrepancy: null };
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const sumFlat = lineItems.reduce((s, li) => s + (Number(li.amount_ttc) || 0), 0);
  const sumQty = lineItems.reduce((s, li) => s + (Number(li.amount_ttc) || 0) * (Number(li.quantity) || 1), 0);
  for (const lineSum of [sumFlat, sumQty]) {
    if (Math.abs(lineSum - grandTotal) <= ARITHMETIC_TOLERANCE) {
      return { check: 'pass', lineSum: round(lineSum), discrepancy: round(lineSum - grandTotal) };
    }
  }
  return { check: 'fail', lineSum: round(sumFlat), discrepancy: round(sumFlat - grandTotal) };
}

export function arithmeticFailReason(r: ArithmeticResult, grandTotal: number): string {
  return `明细合计 ${r.lineSum?.toFixed(2)} 与总额 ${grandTotal.toFixed(2)} 不符(差 ${r.discrepancy?.toFixed(2)})`;
}

export const REASON_TRUNCATED = 'OCR 输出被截断,识别数据可能不完整,请核对明细';
export const REASON_MODEL_BARE_FLAG = '模型标记需复核(未说明原因)';

/** 模型的 needsReview 可能是 true / "true" */
export function looseBool(v: unknown): boolean {
  return v === true || (typeof v === 'string' && v.trim().toLowerCase() === 'true');
}

export interface MergeReviewInput {
  modelReviewReasons: unknown;
  modelNeedsReview: unknown;
  arithmetic: ArithmeticResult;
  grandTotal: number | null | undefined;
  repaired: boolean;
}

/**
 * 合并复核理由,规则:
 * - 模型的算术类理由一律丢弃(服务端校验是唯一权威,避免两个互相矛盾的合计数字)
 * - 服务端算术失败 → 加服务端理由;JSON 修复过 → 加截断理由
 * - 模型裸 needsReview(没有留下任何非算术理由):只有当它的理由全是算术类、
 *   且服务端已验证通过时才不采信;其它情况(没给理由、或服务端无法验证)照样标记
 */
export function mergeReviewReasons(input: MergeReviewInput): { needsReview: boolean; reviewReasons: string[] } {
  const all = normalizeReviewReasons(input.modelReviewReasons);
  const kept = all.filter((r) => !isArithmeticReason(r));
  const reasons = new Set<string>(kept);

  if (input.arithmetic.check === 'fail' && input.grandTotal) {
    reasons.add(arithmeticFailReason(input.arithmetic, input.grandTotal));
  }
  if (input.repaired) reasons.add(REASON_TRUNCATED);

  if (looseBool(input.modelNeedsReview) && reasons.size === 0) {
    const onlyArithmeticAndVerified = all.length > 0 && kept.length === 0 && input.arithmetic.check === 'pass';
    if (!onlyArithmeticAndVerified) reasons.add(REASON_MODEL_BARE_FLAG);
  }
  return { needsReview: reasons.size > 0, reviewReasons: Array.from(reasons) };
}
