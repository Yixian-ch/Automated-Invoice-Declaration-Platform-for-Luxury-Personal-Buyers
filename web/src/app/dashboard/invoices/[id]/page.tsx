'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { invoiceApi, type Invoice, type InvoiceStatus, type LineItem } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  PENDING: '待审核',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
};

const STATUS_VARIANT: Record<InvoiceStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  APPROVED: 'default',
  REJECTED: 'destructive',
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

  const isApproved = invoice.status === 'APPROVED';
  const imageUrl = `${API_BASE}/api/v1/invoices/${id}/image`;

  const confidence =
    invoice.ocrConfidence != null
      ? `${Math.round(invoice.ocrConfidence * 100)}%`
      : null;

  return (
    <main className="min-h-screen flex flex-col bg-surface">
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

          {/* 右侧 — OCR 结果 */}
          <div className="card-luxury">
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs tracking-widest uppercase text-muted">OCR 识别结果</p>
                <Badge variant={STATUS_VARIANT[invoice.status]}>
                  {STATUS_LABEL[invoice.status]}
                </Badge>
              </div>

              <div className="divide-y divide-stone-100">
                <Field label="门店" value={invoice.vendorName} />
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
                      ? `${invoice.currency ?? '€'} ${Number(invoice.grandTotalAmount).toFixed(2)}`
                      : null
                  }
                />
                <Field
                  label="OCR 置信度"
                  value={
                    confidence ? (
                      <span className={Number(invoice.ocrConfidence) >= 0.8 ? 'text-green-700' : 'text-amber-600'}>
                        {confidence}
                      </span>
                    ) : null
                  }
                />
                {isApproved && (
                  <div className="py-3">
                    <p className="text-xs tracking-widest uppercase text-muted mb-0.5">返点</p>
                    <p className="text-xl font-light text-gold" style={{ fontFamily: 'var(--font-serif)' }}>
                      {invoice.cashbackAmount
                        ? `€${Number(invoice.cashbackAmount).toFixed(2)}`
                        : '—'}
                    </p>
                  </div>
                )}
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

        {/* 行项目表格 */}
        {invoice.lineItems && invoice.lineItems.length > 0 && (
          <div className="card-luxury mt-8">
            <p className="text-xs tracking-widest uppercase text-muted mb-4">行项目</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 text-xs text-stone-400 uppercase tracking-wider">
                    <th className="text-left py-2 pr-4 font-medium">商品描述</th>
                    <th className="text-right py-2 pr-4 font-medium">数量</th>
                    <th className="text-right py-2 font-medium">含税金额</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.lineItems.map((item: LineItem, i: number) => (
                    <tr key={i} className="border-b border-stone-50">
                      <td className="py-2 pr-4 text-stone-700">{item.description}</td>
                      <td className="py-2 pr-4 text-right text-stone-600">
                        {item.quantity != null ? item.quantity : '—'}
                      </td>
                      <td className="py-2 text-right text-stone-700">
                        {item.amount_ttc != null
                          ? `${invoice.currency ?? '€'} ${Number(item.amount_ttc).toFixed(2)}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
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
