'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  settlementApi,
  type PendingCashback,
  type Settlement,
  type SettlementMethod,
  type SettlementStatus,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

const METHOD_LABEL: Record<SettlementMethod, string> = {
  BANK_TRANSFER: '银行卡打款',
  VOUCHER: '代金券',
  GIFT_CARD: '礼品券',
};

function statusLabel(s: Settlement): string {
  if (s.method === 'BANK_TRANSFER') {
    return { CONFIRMED: '已确认（打款未发送）', SENT: '打款处理中', PAID: '已到账', FAILED: '打款失败' }[s.status];
  }
  return { CONFIRMED: '待发放', SENT: '发放中', PAID: '已发放', FAILED: '发放失败' }[s.status];
}

const STATUS_VARIANT: Record<SettlementStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  CONFIRMED: 'outline',
  SENT: 'secondary',
  PAID: 'default',
  FAILED: 'destructive',
};

export function SettlementSection({ accessToken }: { accessToken: string }) {
  const { user } = useAuth();
  const [pending, setPending] = useState<PendingCashback[]>([]);
  const [history, setHistory] = useState<Settlement[]>([]);
  const [target, setTarget] = useState<PendingCashback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [method, setMethod] = useState<SettlementMethod>('BANK_TRANSFER');
  const [bank, setBank] = useState({ name: '', iban: '', bic: '', save: true });

  const reload = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([
        settlementApi.pending(accessToken),
        settlementApi.mine(accessToken),
      ]);
      setPending(p);
      setHistory(h);
    } catch {
      // non-fatal — sections stay empty
    }
  }, [accessToken]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Prefill synchronously from the auth context — an async fetch here could
  // resolve late and overwrite an IBAN the user is typing
  const openConfirm = (item: PendingCashback) => {
    setMethod('BANK_TRANSFER');
    setBank({
      name: user?.bankAccountName ?? `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim(),
      iban: user?.bankIban ?? '',
      bic: user?.bankBic ?? '',
      save: true,
    });
    setTarget(item);
  };

  const submit = async () => {
    if (!target) return;
    const isBank = method === 'BANK_TRANSFER';
    if (isBank && (!bank.name.trim() || !bank.iban.trim())) {
      toast.error('请填写收款人姓名与 IBAN');
      return;
    }
    setSubmitting(true);
    try {
      const res = await settlementApi.confirm(accessToken, {
        invoiceId: target.id,
        method,
        ...(isBank
          ? {
              bankAccountName: bank.name.trim(),
              bankIban: bank.iban.trim(),
              bankBic: bank.bic.trim() || undefined,
              saveBankInfo: bank.save,
            }
          : {}),
      });
      if (!isBank) {
        toast.success(`返点已确认，${METHOD_LABEL[method]}将由平台发放`);
      } else if (res.status === 'FAILED') {
        toast.warning('返点已确认，但打款指令发送失败，可稍后在结算记录中重试');
      } else {
        toast.success('返点已确认，打款指令已发送');
      }
      setTarget(null);
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '确认失败');
    } finally {
      setSubmitting(false);
    }
  };

  const retry = async (id: string) => {
    try {
      const res = await settlementApi.retry(accessToken, id);
      if (res.status === 'FAILED') toast.error(`重试失败：${res.failureReason ?? '未知错误'}`);
      else toast.success('打款指令已重新发送');
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '重试失败');
    }
  };

  if (pending.length === 0 && history.length === 0) return null;

  return (
    <>
      {/* 待确认返点 */}
      {pending.length > 0 && (
        <div className="card-luxury">
          <p className="mb-6 text-xs tracking-widest uppercase text-muted">待确认返点</p>
          <div className="space-y-3">
            {pending.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-50 pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-stone-700">{item.vendorName ?? '—'}</p>
                  <p className="text-xs text-stone-500">
                    {item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString('zh-CN') : '—'}
                    {item.grandTotalAmount && ` · 消费 €${Number(item.grandTotalAmount).toFixed(2)}`}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-[#B8966E]">
                    €{Number(item.cashbackAmount).toFixed(2)}
                  </span>
                  <Button size="sm" onClick={() => openConfirm(item)} style={{ backgroundColor: '#B8966E', color: 'white' }}>
                    确认返点
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 结算记录 */}
      {history.length > 0 && (
        <div className="card-luxury">
          <p className="mb-6 text-xs tracking-widest uppercase text-muted">结算记录</p>
          <div className="space-y-3">
            {history.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-50 pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-stone-700">{s.invoice.vendorName ?? '—'}</p>
                  <p className="text-xs text-stone-500">
                    {new Date(s.confirmedAt).toLocaleDateString('zh-CN')} · {METHOD_LABEL[s.method]}
                    {s.bankIban && ` ····${s.bankIban.slice(-4)}`}
                    {s.status === 'FAILED' && s.failureReason && ` · ${s.failureReason}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-stone-700">€{Number(s.amount).toFixed(2)}</span>
                  <Badge variant={STATUS_VARIANT[s.status]}>{statusLabel(s)}</Badge>
                  {s.method === 'BANK_TRANSFER' && (s.status === 'FAILED' || s.status === 'CONFIRMED') && (
                    <Button size="sm" variant="outline" onClick={() => retry(s.id)}>
                      {s.status === 'FAILED' ? '重试' : '发送打款'}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 确认弹窗 */}
      <Dialog open={!!target} onOpenChange={(open) => !open && !submitting && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认返点结算</DialogTitle>
          </DialogHeader>
          {target && (
            <div className="space-y-4">
              <div className="rounded border border-border bg-stone-50/60 p-3 text-sm">
                <p className="text-stone-700">{target.vendorName ?? '—'}</p>
                <p className="mt-1 text-lg text-[#B8966E]">
                  返点金额 €{Number(target.cashbackAmount).toFixed(2)}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-xs text-muted">结算方式</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(METHOD_LABEL) as SettlementMethod[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMethod(m)}
                      className={`rounded border px-3 py-2 text-sm transition-colors ${
                        method === m
                          ? 'border-[#B8966E] bg-[#B8966E]/10 text-[#B8966E]'
                          : 'border-border text-stone-600 hover:border-stone-300'
                      }`}
                    >
                      {METHOD_LABEL[m]}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  {method === 'BANK_TRANSFER'
                    ? '自动打款至您的银行账户'
                    : method === 'VOUCHER'
                      ? '平台发放等额代金券，可抵扣合作商家消费'
                      : '平台发放等额礼品券'}
                </p>
              </div>

              {method === 'BANK_TRANSFER' && (
              <>
              <div>
                <label className="mb-1.5 block text-xs text-muted">收款人姓名</label>
                <input
                  className="input-luxury w-full"
                  value={bank.name}
                  onChange={(e) => setBank((b) => ({ ...b, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted">IBAN</label>
                <input
                  className="input-luxury w-full"
                  placeholder="FR76 …"
                  value={bank.iban}
                  onChange={(e) => setBank((b) => ({ ...b, iban: e.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs text-muted">BIC（可选）</label>
                <input
                  className="input-luxury w-full"
                  value={bank.bic}
                  onChange={(e) => setBank((b) => ({ ...b, bic: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={bank.save}
                  onChange={(e) => setBank((b) => ({ ...b, save: e.target.checked }))}
                />
                保存收款信息，下次自动填写
              </label>
              </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={submitting} onClick={() => setTarget(null)}>
              取消
            </Button>
            <Button
              disabled={submitting}
              onClick={submit}
              style={{ backgroundColor: '#B8966E', color: 'white' }}
            >
              {submitting ? '提交中…' : method === 'BANK_TRANSFER' ? '确认并申请打款' : '确认结算'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
