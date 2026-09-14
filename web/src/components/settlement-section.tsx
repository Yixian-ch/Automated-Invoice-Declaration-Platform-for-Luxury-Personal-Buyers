'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  settlementApi,
  type PendingCashback,
  type Settlement,
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

const STATUS_LABEL: Record<SettlementStatus, string> = {
  CONFIRMED: '已确认（打款未发送）',
  SENT: '打款处理中',
  PAID: '已到账',
  FAILED: '打款失败',
};

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
    if (!bank.name.trim() || !bank.iban.trim()) {
      toast.error('请填写收款人姓名与 IBAN');
      return;
    }
    setSubmitting(true);
    try {
      const res = await settlementApi.confirm(accessToken, {
        invoiceId: target.id,
        method: 'BANK_TRANSFER',
        bankAccountName: bank.name.trim(),
        bankIban: bank.iban.trim(),
        bankBic: bank.bic.trim() || undefined,
        saveBankInfo: bank.save,
      });
      if (res.status === 'FAILED') {
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
                    {new Date(s.confirmedAt).toLocaleDateString('zh-CN')} · 银行卡
                    {s.bankIban && ` ····${s.bankIban.slice(-4)}`}
                    {s.status === 'FAILED' && s.failureReason && ` · ${s.failureReason}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-stone-700">€{Number(s.amount).toFixed(2)}</span>
                  <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge>
                  {(s.status === 'FAILED' || s.status === 'CONFIRMED') && (
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
                <div className="rounded border border-border px-3 py-2 text-sm text-stone-700">
                  银行卡打款（自动到账）
                </div>
              </div>

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
              {submitting ? '提交中…' : '确认并申请打款'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
