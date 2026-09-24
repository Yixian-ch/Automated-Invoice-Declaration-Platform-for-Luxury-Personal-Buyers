/**
 * 小票自动审核规则(纯逻辑,无 IO,便于单元测试)。
 *
 * 流水线固定顺序:置信度检查 → 条形码去重 → 预约匹配 → 进人工队列。
 * 每步拒绝写各自专属的 rejectReason。
 */

import { normalizeSiret } from '../reservation/siret';

// ─── 拒绝文案 ────────────────────────────────────────────────────────────────

/** 规则 1:照片质量/关键字段不可读。邀请重传的文案,客户重拍后可再次上传 */
export const REJECT_REASON_UNCLEAR_PHOTO = '照片不清晰,请重新拍摄上传';
/** 规则 2:同用户重复提交 */
export const REJECT_REASON_DUPLICATE = '小票重复提交';

/** 默认置信度阈值(可用环境变量 OCR_MIN_CONFIDENCE 覆盖) */
export const DEFAULT_MIN_CONFIDENCE = 0.8;

/** 人工审核标记文案 */
export const REVIEW_REASON_CROSS_USER_DUPLICATE = '条形码与其他用户的小票重复(疑似小票共享/倒卖)';
export const REVIEW_REASON_DISPUTED = '客户对返点金额有异议';

// ─── 规则 1:置信度检查 ──────────────────────────────────────────────────────

export interface ConfidenceInput {
  /** 模型自评图片质量 0–1;缺失时不单独否决(只看关键字段) */
  imageQuality: number | null | undefined;
  /** 条形码下方数字串(去重键) */
  barcode: string | null | undefined;
  /** 商家 SIRET(原始 OCR 值,内部会做 Luhn 校验) */
  merchantTaxId: string | null | undefined;
  purchaseDate: Date | null | undefined;
}

export type ConfidenceResult =
  | { ok: true; siret: string; barcode: string }
  | { ok: false; rejectReason: string; failedChecks: string[] };

/**
 * 通过条件:imageQuality >= threshold(缺失视为通过该子项)
 *          且 条形码、SIRET(Luhn 通过)、购买日期 都可读。
 * 阈值比较用 >=,所以 0.80 放行、0.799 拒绝。
 */
export function checkConfidence(input: ConfidenceInput, threshold: number): ConfidenceResult {
  const failed: string[] = [];

  if (typeof input.imageQuality === 'number' && !Number.isNaN(input.imageQuality)) {
    if (input.imageQuality < threshold) failed.push('imageQuality');
  }

  const barcode = normalizeBarcode(input.barcode);
  if (!barcode) failed.push('barcode');

  const siret = normalizeSiret(input.merchantTaxId);
  if (!siret) failed.push('siret');

  if (!input.purchaseDate || Number.isNaN(input.purchaseDate.getTime())) failed.push('purchaseDate');

  if (failed.length > 0) {
    return { ok: false, rejectReason: REJECT_REASON_UNCLEAR_PHOTO, failedChecks: failed };
  }
  return { ok: true, siret: siret!, barcode: barcode! };
}

/** 条形码号:去掉空白,必须是 8 位以上纯数字 */
export function normalizeBarcode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\s+/g, '');
  return /^\d{8,}$/.test(digits) ? digits : null;
}

// ─── 规则 2:条形码去重 ──────────────────────────────────────────────────────

export interface ExistingInvoiceRef {
  id: string;
  userId: string;
}

export type DuplicateResult =
  | { kind: 'none' }
  | { kind: 'same-user'; rejectReason: string; duplicateOf: ExistingInvoiceRef }
  | { kind: 'cross-user'; reviewReason: string; duplicates: ExistingInvoiceRef[] };

/**
 * @param userId   当前小票所属用户
 * @param existing 与该条形码相同、且处于**非拒绝状态**的其他小票(调用方已按状态过滤,
 *                 已拒绝的记录不占用编号)
 */
export function checkDuplicate(userId: string, existing: ExistingInvoiceRef[]): DuplicateResult {
  if (existing.length === 0) return { kind: 'none' };

  const sameUser = existing.find((e) => e.userId === userId);
  if (sameUser) {
    return { kind: 'same-user', rejectReason: REJECT_REASON_DUPLICATE, duplicateOf: sameUser };
  }
  return {
    kind: 'cross-user',
    reviewReason: REVIEW_REASON_CROSS_USER_DUPLICATE,
    duplicates: existing,
  };
}

/** 阈值解析:环境变量字符串 → 0–1 的数;非法则用默认值 */
export function parseConfidenceThreshold(raw: string | undefined, fallback = DEFAULT_MIN_CONFIDENCE): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  // 允许写成 80 或 0.8
  const v = n > 1 ? n / 100 : n;
  return v >= 0 && v <= 1 ? v : fallback;
}
