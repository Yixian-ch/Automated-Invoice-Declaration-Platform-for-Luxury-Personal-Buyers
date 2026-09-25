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
  if (raw == null || raw === false) return [];
  if (typeof raw === 'string') return raw.trim() ? [raw.trim()] : [];
  if (Array.isArray(raw)) {
    return raw
      .map((r) => (typeof r === 'string' ? r.trim() : r == null ? '' : JSON.stringify(r)))
      .filter((r) => r.length > 0);
  }
  if (typeof raw === 'object') {
    // { lineTotalSumMismatch: {...}, quantityDescriptionMismatch: {...} } → 每个键一条
    return Object.entries(raw as Record<string, unknown>).map(([k, v]) =>
      v == null || v === true ? k : `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`,
    );
  }
  return [String(raw)];
}

export interface ArithmeticResult {
  check: 'pass' | 'fail' | 'skipped';
  lineSum: number | null;
  discrepancy: number | null;
}

/** 服务端算术校验:sum(amount_ttc) 与 grandTotal 的差在容差内即通过 */
export function checkArithmetic(
  lineItems: { amount_ttc?: number | null }[],
  grandTotal: number | null | undefined,
): ArithmeticResult {
  if (!grandTotal || grandTotal <= 0 || lineItems.length === 0) {
    return { check: 'skipped', lineSum: null, discrepancy: null };
  }
  const lineSum = lineItems.reduce((s, li) => s + (Number(li.amount_ttc) || 0), 0);
  const discrepancy = Math.round((lineSum - grandTotal) * 100) / 100;
  const pass = Math.abs(discrepancy) <= ARITHMETIC_TOLERANCE;
  return { check: pass ? 'pass' : 'fail', lineSum: Math.round(lineSum * 100) / 100, discrepancy };
}

export function arithmeticFailReason(r: ArithmeticResult, grandTotal: number): string {
  return `明细合计 ${r.lineSum?.toFixed(2)} 与总额 ${grandTotal.toFixed(2)} 不符(差 ${r.discrepancy?.toFixed(2)})`;
}
