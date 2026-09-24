'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  invoiceApi,
  INVOICE_STATUS_LABEL,
  DISPUTE_CATEGORY_LABEL,
  type Invoice,
  type InvoiceStatus,
  type CashbackBreakdownItem,
} from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { NameWatermark } from '@/components/name-watermark';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STATUS_LABEL: Record<InvoiceStatus, string> = INVOICE_STATUS_LABEL;

const STATUS_VARIANT: Record<InvoiceStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  APPROVED: 'default',
  REJECTED: 'destructive',
  AWAITING_CONFIRMATION: 'secondary',
  CONFIRMED: 'default',
  DISPUTED: 'outline',
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-stone-100 last:border-0">
      <p className="text-xs tracking-widest uppercase text-muted mb-0.5">{label}</p>
      <p className="text-sm text-stone-800">{value ?? '—'}</p>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken, isLoading: authLoading, user } = useAuth();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const fetchInvoice = async () => {
    if (!accessToken || !id) return;
    try {
      const data = await invoiceApi.get(id, accessToken);
      setInvoice(data);
      setError(null);
      return data;
    } catch (e: any) {
      setError(e.message ?? '加载小票失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    fetchInvoice();
  }, [accessToken, id]);

  if (authLoading || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="w-px h-10 bg-gold animate-pulse" />
      </main>
    );
  }

  if (error || !invoice) {
    return (
      <main className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-muted text-sm">{error ?? '找不到此小票'}</p>
            <button onClick={() => router.push('/dashboard')} className="btn-ghost text-sm">
              ← 返回工作台
            </button>
          </div>
        </div>
      </main>
    );
  }

  // 只有客户确认后金额才是最终值;审核中/异议中显示"预估"
  const isApproved = invoice.status === 'CONFIRMED' || invoice.status === 'AWAITING_CONFIRMATION' || invoice.status === 'APPROVED';
  const imageUrl = `${API_BASE}/api/v1/invoices/${id}/image`;
  const currency = invoice.currency ?? '€';
  const breakdown = invoice.cashbackBreakdown ?? [];
  const totalCashback = breakdown.reduce((s, it) => s + (Number(it.cashback) || 0), 0);

  return (
    <main className="relative min-h-screen flex flex-col bg-surface">
      <NameWatermark />
      <div className="relative z-10 flex flex-col flex-1">
      <Header />

      <div className="flex-1 px-8 py-10 max-w-5xl mx-auto w-full">
        {/* 返回链接 */}
        <button
          onClick={() => router.push('/dashboard')}
          className="btn-ghost text-xs mb-8 flex items-center gap-1"
        >
          ← 返回工作台
        </button>

        {/* 页面标题 */}
        <div className="mb-8">
          <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
            小票详情
          </h1>
          <div className="w-8 h-px bg-gold mt-3" />
        </div>

        {/* 两列布局 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* 左侧 — 小票图片 */}
          <div className="card-luxury flex flex-col items-center justify-center min-h-[400px]">
            {imgError ? (
              <div className="text-center space-y-2 text-muted">
                <p className="text-4xl">🧾</p>
                <p className="text-sm">图片不可用</p>
                {invoice.originalFilename && (
                  <p className="text-xs text-stone-400">{invoice.originalFilename}</p>
                )}
              </div>
            ) : (
              <img
                src={imageUrl}
                alt={invoice.originalFilename ?? '小票'}
                onError={() => setImgError(true)}
                className="max-w-full max-h-[600px] object-contain rounded"
              />
            )}
          </div>

          {/* 右侧 — 小票信息 */}
          <div className="card-luxury">
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs tracking-widest uppercase text-muted">小票信息</p>
                <Badge variant={STATUS_VARIANT[invoice.status]}>
                  {STATUS_LABEL[invoice.status]}
                </Badge>
              </div>

              {invoice.status === 'REJECTED' && invoice.rejectReason && (
                <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-xs tracking-widest uppercase text-red-500 mb-0.5">拒绝原因</p>
                  <p className="text-sm text-red-700">{invoice.rejectReason}</p>
                  {invoice.rejectReason.includes('重新拍摄') && (
                    <button onClick={() => router.push('/dashboard/upload')} className="mt-2 text-xs text-red-700 underline">
                      重新上传 →
                    </button>
                  )}
                </div>
              )}

              {invoice.status === 'AWAITING_CONFIRMATION' && (
                <div className="mb-4 border border-[#B8966E]/50 bg-amber-50/60 px-4 py-3 flex items-center justify-between gap-3">
                  <p className="text-sm text-stone-700">审核已通过,请核对返点金额并确认。</p>
                  <button
                    onClick={() => router.push(`/dashboard/invoices/${id}/confirm`)}
                    className="text-sm text-[#B8966E] hover:underline whitespace-nowrap"
                  >
                    去确认 →
                  </button>
                </div>
              )}

              {invoice.status === 'DISPUTED' && (
                <div className="mb-4 border border-stone-200 bg-stone-50 px-4 py-3">
                  <p className="text-xs tracking-widest uppercase text-muted mb-0.5">异议处理中</p>
                  <p className="text-sm text-stone-700">
                    {invoice.disputeCategory ? DISPUTE_CATEGORY_LABEL[invoice.disputeCategory] : ''}
                    {invoice.disputeReason ? `:${invoice.disputeReason}` : ''}
                  </p>
                  <p className="text-xs text-stone-500 mt-1">审核员复核后会重新通知您确认金额。</p>
                </div>
              )}

              {invoice.status === 'CONFIRMED' && (
                <div className="mb-4 border border-green-200 bg-green-50 px-4 py-3">
                  <p className="text-sm text-green-800">
                    返点金额已于 {invoice.confirmedAt ? new Date(invoice.confirmedAt).toLocaleDateString('zh-CN') : ''} 确认并锁定。
                  </p>
                </div>
              )}

              {invoice.disputeResolutionNote && invoice.status !== 'DISPUTED' && (
                <div className="mb-4 border border-stone-200 bg-stone-50 px-4 py-3">
                  <p className="text-xs tracking-widest uppercase text-muted mb-0.5">审核员复核说明</p>
                  <p className="text-sm text-stone-700 whitespace-pre-wrap">{invoice.disputeResolutionNote}</p>
                </div>
              )}

              <div className="divide-y divide-stone-100">
                <Field label="门店" value={invoice.vendorName} />
                <Field label="发票号" value={invoice.invoiceNumber} />
                <Field
                  label="购买日期"
                  value={
                    invoice.purchaseDate
                      ? new Date(invoice.purchaseDate).toLocaleDateString('zh-CN', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })
                      : null
                  }
                />
                <Field
                  label="金额"
                  value={
                    invoice.grandTotalAmount
                      ? `${currency} ${Number(invoice.grandTotalAmount).toFixed(2)}`
                      : null
                  }
                />
                <div className="py-3">
                  <p className="text-xs tracking-widest uppercase text-muted mb-0.5">
                    返点{!isApproved && '（预估）'}
                  </p>
                  <p className="text-xl font-light text-gold" style={{ fontFamily: 'var(--font-serif)' }}>
                    {invoice.cashbackAmount
                      ? `€${Number(invoice.cashbackAmount).toFixed(2)}`
                      : '—'}
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-stone-100">
                <p className="text-xs text-stone-400">
                  上传时间{' '}
                  {invoice.uploadedAt
                    ? new Date(invoice.uploadedAt).toLocaleString('zh-CN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : new Date(invoice.createdAt).toLocaleString('zh-CN', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 返点明细（按商品逐条） */}
        {breakdown.length > 0 && (
          <div className="card-luxury mt-8">
            <p className="text-xs tracking-widest uppercase text-muted mb-4">
              返点明细{!isApproved && '（预估）'}
            </p>
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
                    const amount = Number(item.amountTTC) || 0;
                    const cash = Number(item.cashback) || 0;
                    const rate = amount > 0 ? cash / amount : 0;
                    return (
                      <tr key={i} className="border-b border-stone-50">
                        <td className="py-2 pr-4 text-stone-700">
                          {item.description || '—'}
                          {item.brand && (
                            <span className="ml-2 text-xs text-stone-400">{item.brand}</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 text-right text-stone-700">
                          {currency} {amount.toFixed(2)}
                        </td>
                        <td className="py-2 pr-4 text-right text-stone-600">
                          {(rate * 100).toFixed(1)}%
                        </td>
                        <td className="py-2 text-right text-gold">
                          €{cash.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-stone-200 font-medium">
                    <td className="py-2.5 pr-4 text-stone-700">合计</td>
                    <td className="py-2.5 pr-4"></td>
                    <td className="py-2.5 pr-4"></td>
                    <td className="py-2.5 text-right text-gold">€{totalCashback.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
      </div>
    </main>
  );
}

function Header() {
  return (
    <header className="border-b border-border px-8 py-4 flex items-center justify-between">
      <span className="text-sm tracking-[0.2em] uppercase" style={{ fontFamily: 'var(--font-serif)' }}>
        LIDP
      </span>
    </header>
  );
}
