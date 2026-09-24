/**
 * 客户确认返点金额的状态机(纯逻辑,便于单元测试)。
 *
 *   PENDING/DISPUTED --后台通过--> AWAITING_CONFIRMATION
 *   AWAITING_CONFIRMATION --客户确认无误--> CONFIRMED(confirmedAt,金额锁定)
 *   AWAITING_CONFIRMATION --客户金额有误--> DISPUTED(disputedAt, disputeReason, disputeCount+1)
 *   DISPUTED --后台复核(修正或维持)--> AWAITING_CONFIRMATION(附复核说明)
 *
 * "客户未操作"不是状态,是停留在 AWAITING_CONFIRMATION。
 * CONFIRMED 后:金额不可改、不可再发起异议。
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import { InvoiceStatus } from '@prisma/client';

export const DISPUTE_CATEGORIES = ['AMOUNT_WRONG', 'ITEMS_WRONG', 'OTHER'] as const;
export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number];

export const DISPUTE_CATEGORY_LABEL: Record<DisputeCategory, string> = {
  AMOUNT_WRONG: '金额算错',
  ITEMS_WRONG: '明细不对',
  OTHER: '其他',
};

/** 直接是 HttpException:'conflict' → 409,'bad-request' → 400,控制器无需再映射 */
export class ConfirmationError extends HttpException {
  constructor(
    message: string,
    readonly kind: 'conflict' | 'bad-request',
  ) {
    super(message, kind === 'conflict' ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST);
    this.name = 'ConfirmationError';
  }
}

export interface ConfirmableInvoice {
  status: InvoiceStatus;
  cashbackAmount: { toString(): string } | number | null;
  disputeCount: number;
}

/** 返点金额是否已锁定(CONFIRMED 后任何金额修改都要拒绝) */
export function isAmountLocked(invoice: { status: InvoiceStatus }): boolean {
  return invoice.status === InvoiceStatus.CONFIRMED;
}

export function assertAmountEditable(invoice: { status: InvoiceStatus }): void {
  if (isAmountLocked(invoice)) {
    throw new ConfirmationError('返点金额已由客户确认并锁定,不可修改', 'conflict');
  }
}

/** 后台"通过":只能从人工队列(PENDING)进入待确认;异议中的小票必须走复核流程 */
export function assertCanApprove(invoice: { status: InvoiceStatus }): void {
  assertAmountEditable(invoice);
  if (invoice.status === InvoiceStatus.DISPUTED) {
    throw new ConfirmationError('金额异议中的小票请通过"处理异议"复核后返回客户确认', 'bad-request');
  }
  if (invoice.status !== InvoiceStatus.PENDING) {
    throw new ConfirmationError('只有待审核的小票可以通过', 'bad-request');
  }
}

export function assertCanReject(invoice: { status: InvoiceStatus }): void {
  if (isAmountLocked(invoice)) {
    throw new ConfirmationError('返点金额已由客户确认并锁定,不可拒绝', 'conflict');
  }
}

/** 客户确认:必须在待确认状态,且有可确认的金额 */
export function assertCanConfirm(invoice: ConfirmableInvoice): void {
  if (invoice.status === InvoiceStatus.CONFIRMED) {
    throw new ConfirmationError('该小票的返点金额已确认', 'conflict');
  }
  if (invoice.status !== InvoiceStatus.AWAITING_CONFIRMATION) {
    throw new ConfirmationError('该小票当前不在待确认状态', 'bad-request');
  }
  const amount = invoice.cashbackAmount == null ? 0 : Number(invoice.cashbackAmount.toString());
  if (!(amount > 0)) {
    throw new ConfirmationError('该小票没有可确认的返点金额', 'bad-request');
  }
}

export interface DisputeInput {
  category: string;
  note: string;
}

/** 客户异议:只能在待确认状态发起;原因分类 + 备注必填 */
export function assertCanDispute(invoice: ConfirmableInvoice, input: DisputeInput): void {
  if (invoice.status === InvoiceStatus.CONFIRMED) {
    throw new ConfirmationError('返点金额已确认,不可再提出异议', 'conflict');
  }
  if (invoice.status !== InvoiceStatus.AWAITING_CONFIRMATION) {
    throw new ConfirmationError('该小票当前不在待确认状态,无法提出异议', 'bad-request');
  }
  if (!DISPUTE_CATEGORIES.includes(input.category as DisputeCategory)) {
    throw new ConfirmationError('请选择异议原因', 'bad-request');
  }
  if (!input.note || !input.note.trim()) {
    throw new ConfirmationError('请填写异议说明', 'bad-request');
  }
}

/** 后台处理异议:只能处理 DISPUTED;金额未变时复核说明必填 */
export function assertCanResolveDispute(
  invoice: { status: InvoiceStatus },
  opts: { amountChanged: boolean; note: string | undefined },
): void {
  if (invoice.status !== InvoiceStatus.DISPUTED) {
    throw new ConfirmationError('只有金额异议中的小票可以复核', 'bad-request');
  }
  if (!opts.amountChanged && !(opts.note && opts.note.trim())) {
    throw new ConfirmationError('维持原金额时必须填写复核说明', 'bad-request');
  }
}

/** 客户异议后的字段变化(同时快照当时的金额,复核时据此判断是否变化) */
export function applyDispute(
  invoice: ConfirmableInvoice,
  input: DisputeInput,
  now: Date = new Date(),
): {
  status: InvoiceStatus;
  disputedAt: Date;
  disputeCategory: string;
  disputeReason: string;
  disputeCount: number;
  disputedAmount: number;
  needsReview: boolean;
} {
  assertCanDispute(invoice, input);
  return {
    status: InvoiceStatus.DISPUTED,
    disputedAt: now,
    disputeCategory: input.category,
    disputeReason: input.note.trim(),
    disputeCount: invoice.disputeCount + 1,
    disputedAmount: Number(invoice.cashbackAmount!.toString()),
    needsReview: true,
  };
}

/** 客户确认后的字段变化 */
export function applyConfirm(
  invoice: ConfirmableInvoice,
  now: Date = new Date(),
): { status: InvoiceStatus; confirmedAt: Date } {
  assertCanConfirm(invoice);
  return { status: InvoiceStatus.CONFIRMED, confirmedAt: now };
}
