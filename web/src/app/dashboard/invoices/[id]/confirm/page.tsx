'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import {
  invoiceApi,
  DISPUTE_CATEGORY_LABEL,
  type CashbackBreakdownItem,
  type DisputeCategory,
  type Invoice,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { NameWatermark } from '@/components/name-watermark';

const SUPPORT_WECHAT = process.env.NEXT_PUBLIC_SUPPORT_WECHAT ?? '';

export default function ConfirmCashbackPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken, isLoading: authLoading, user } = useAuth();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [disputing, setDisputing] = useState(false);
  const [category, setCategory] = useState<DisputeCategory | ''>('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!accessToken || !id) return;
    try {
      const data = await invoiceApi.get(id, accessToken);
      setInvoice(data);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '加载小票失败');
    } finally {
      setLoading(false);
    }
  }, [accessToken, id]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (accessToken) load();
  }, [accessToken, load]);

  const handleConfirm = async () => {
    if (!accessToken || !invoice) return;
    if (!window.confirm('确认返点金额无误?一旦确认,返点金额不可更改。')) return;
    setSubmitting(true);
    try {
      await invoiceApi.confirmCashback(accessToken, invoice.id);
      toast.success('返点金额已确认,请选择结算方式');
      router.push('/dashboard');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '确认失败');
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDispute = async () => {
    if (!accessToken || !invoice) return;
    if (!category) { toast.error('请选择异议原因'); return; }
    if (!note.trim()) { toast.error('请填写异议说明'); return; }
    setSubmitting(true);
    try {
      await invoiceApi.disputeCashback(accessToken, invoice.id, { category, note: note.trim() });
      toast.success('异议已提交,审核员将复核后重新通知您确认');
      router.push('/dashboard');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '提交失败');
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="w-px h-10 bg-gold animate-pulse" />
      </main>
    );
  }

  if (error || !invoice) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted text-sm">{error ?? '找不到此小票'}</p>
          <button onClick={() => router.push('/dashboard')} className="btn-ghost text-sm">← 返回工作台</button>
        </div>
      </main>
    );
  }

  const currency = invoice.currency ?? '€';
  const breakdown = invoice.cashbackBreakdown ?? [];
  const amount = Number(invoice.cashbackAmount ?? 0);
  const awaiting = invoice.status === 'AWAITING_CONFIRMATION';

  return (
    <main className="relative min-h-screen flex flex-col bg-surface">
      <NameWatermark />
      <div className="relative z-10 flex flex-col flex-1">
        <header className="border-b border-border px-8 py-4">
          <span className="text-sm tracking-[0.2em] uppercase" style={{ fontFamily: 'var(--font-serif)' }}>LIDP</span>
        </header>

        <div className="flex-1 px-8 py-10 max-w-3xl mx-auto w-full">
          <button onClick={() => router.push('/dashboard')} className="btn-ghost text-xs mb-8 flex items-center gap-1">
            ← 返回工作台
          </button>

          <div className="mb-8">
            <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>确认返点金额</h1>
            <div className="w-8 h-px bg-gold mt-3" />
          </div>

          {!awaiting && (
            <div className="card-luxury mb-6">
              <p className="text-sm text-stone-700">
                {invoice.status === 'CONFIRMED'
                  ? '该小票的返点金额已确认并锁定,请回工作台选择结算方式。'
                  : invoice.status === 'DISPUTED'
                    ? '您已对该小票提出异议,审核员复核后会重新通知您确认。'
                    : '该小票当前不在待确认状态。'}
              </p>
            </div>
          )}

          {/* 金额与明细 */}
          <div className="card-luxury space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs tracking-widest uppercase text-muted mb-1">门店</p>
                <p className="text-sm text-stone-800">{invoice.vendorName ?? '—'}</p>
                <p className="text-xs text-stone-500 mt-1">
                  {invoice.purchaseDate ? new Date(invoice.purchaseDate).toLocaleDateString('zh-CN') : '—'}
                  {invoice.grandTotalAmount && ` · 消费 ${currency} ${Number(invoice.grandTotalAmount).toFixed(2)}`}
                  {invoice.invoiceNumber && ` · 小票号 ${invoice.invoiceNumber}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs tracking-widest uppercase text-muted mb-1">返点金额</p>
                <p className="text-3xl font-light text-gold" style={{ fontFamily: 'var(--font-serif)' }}>
                  €{amount.toFixed(2)}
                </p>
              </div>
            </div>

            {invoice.disputeResolutionNote && (
              <div className="border border-[#B8966E]/50 bg-amber-50/60 px-4 py-3">
                <p className="text-xs tracking-widest uppercase text-[#B8966E] mb-1">审核员复核说明</p>
                <p className="text-sm text-stone-700 whitespace-pre-wrap">{invoice.disputeResolutionNote}</p>
              </div>
            )}

            {breakdown.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 text-xs text-stone-400 uppercase tracking-wider">
                      <th className="text-left py-2 pr-4 font-medium">商品描述</th>
                      <th className="text-right py-2 pr-4 font-medium">含税金额</th>
                      <th className="text-right py-2 pr-4 font-medium">返点比例</th>
                      <th className="text-right py-2 font-medium">返点金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map((item: CashbackBreakdownItem, i: number) => {
                      const a = Number(item.amountTTC) || 0;
                      const c = Number(item.cashback) || 0;
                      return (
                        <tr key={i} className="border-b border-stone-50">
                          <td className="py-2 pr-4 text-stone-700">
                            {item.description || '—'}
                            {item.brand && <span className="ml-2 text-xs text-stone-400">{item.brand}</span>}
                          </td>
                          <td className="py-2 pr-4 text-right text-stone-700">{currency} {a.toFixed(2)}</td>
                          <td className="py-2 pr-4 text-right text-stone-600">{a > 0 ? ((c / a) * 100).toFixed(1) : '0.0'}%</td>
                          <td className="py-2 text-right text-gold">€{c.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {awaiting && (
              <>
                <div className="border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-sm text-red-700 font-medium">
                    请仔细核对返点金额是否无误,一旦确认返点金额不可更改。
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={handleConfirm}
                    disabled={submitting || disputing}
                    className="flex-1"
                    style={{ backgroundColor: '#B8966E', color: 'white' }}
                  >
                    {submitting && !disputing ? '提交中…' : '确认无误'}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={submitting}
                    className="flex-1"
                    onClick={() => setDisputing((v) => !v)}
                  >
                    金额有误
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* 异议表单 */}
          {awaiting && disputing && (
            <div className="card-luxury mt-6 space-y-5">
              <div>
                <p className="text-xs tracking-widest uppercase text-muted mb-1">提出异议</p>
                <p className="text-xs text-stone-500">
                  提交后该小票会回到人工复核,审核员会修正识别数据后按返点规则重新计算,或维持原金额并给出说明。
                  {invoice.disputeCount ? ` 该小票已提出过 ${invoice.disputeCount} 次异议。` : ''}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs text-muted">异议原因</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(DISPUTE_CATEGORY_LABEL) as DisputeCategory[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`rounded border px-3 py-2 text-sm transition-colors ${
                        category === c
                          ? 'border-[#B8966E] bg-[#B8966E]/10 text-[#B8966E]'
                          : 'border-border text-stone-600 hover:border-stone-300'
                      }`}
                    >
                      {DISPUTE_CATEGORY_LABEL[c]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs text-muted">说明(必填)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  className="input-luxury"
                  placeholder="请具体说明哪里不对,例如:第 2 行商品是 DIOR 不是 GUCCI;小票总额应为 11360 欧元…"
                />
              </div>

              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-stone-400">
                  如有疑问也可联系客服{SUPPORT_WECHAT ? `(微信:${SUPPORT_WECHAT})` : ''}。
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" disabled={submitting} onClick={() => { setDisputing(false); setCategory(''); setNote(''); }}>
                    取消
                  </Button>
                  <Button
                    onClick={handleDispute}
                    disabled={submitting}
                    style={{ backgroundColor: '#B91C1C', color: 'white' }}
                  >
                    {submitting ? '提交中…' : '提交异议'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
