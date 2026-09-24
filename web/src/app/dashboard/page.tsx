'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { invoiceApi, INVOICE_STATUS_LABEL, type Invoice } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SettlementSection } from '@/components/settlement-section';
import { NameWatermark } from '@/components/name-watermark';

const STATUS_LABEL: Record<string, string> = INVOICE_STATUS_LABEL;

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  APPROVED: 'default',
  REJECTED: 'destructive',
  AWAITING_CONFIRMATION: 'secondary',
  CONFIRMED: 'default',
  DISPUTED: 'outline',
};

export default function DashboardPage() {
  const { user, isLoading, logout, accessToken } = useAuth();
  const router = useRouter();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  const loadInvoices = useCallback(async () => {
    if (!accessToken) return;
    setInvoicesLoading(true);
    try {
      const res = await invoiceApi.list(accessToken);
      setInvoices(res.items);
      setTotal(res.total);
    } catch {
      // non-fatal — table stays empty
    } finally {
      setInvoicesLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user && accessToken) loadInvoices();
  }, [user, accessToken, loadInvoices]);

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="w-px h-10 bg-gold animate-pulse" />
      </main>
    );
  }

  const pending = invoices.filter((i) => i.status === 'PENDING' || i.status === 'DISPUTED').length;
  const awaiting = invoices.filter((i) => i.status === 'AWAITING_CONFIRMATION');
  // 只有客户确认过金额(CONFIRMED)的返点才计入
  const totalCashback = invoices
    .filter((i) => i.status === 'CONFIRMED')
    .reduce((sum, i) => sum + (Number(i.cashbackAmount) || 0), 0);

  return (
    <main className="relative min-h-screen flex flex-col">
      <NameWatermark />
      {/* 导航栏 */}
      <header className="relative z-10 border-b border-border px-8 py-4 flex items-center justify-between">
        <span className="text-sm tracking-[0.2em] uppercase" style={{ fontFamily: 'var(--font-serif)' }}>
          LIDP
        </span>
        <nav className="flex items-center gap-6">
          <span className="text-xs text-muted">
            {user.firstName} {user.lastName}
          </span>
          <button
            onClick={() => router.push('/dashboard/profile')}
            className="btn-ghost text-xs"
          >
            我的主页
          </button>
          <button onClick={logout} className="btn-ghost text-xs">
            退出
          </button>
        </nav>
      </header>

      {/* 内容区 */}
      <div className="relative z-10 flex-1 px-8 py-12 max-w-5xl mx-auto w-full space-y-10">

        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
              工作台
            </h1>
            <div className="w-8 h-px bg-gold mt-3" />
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => router.push('/dashboard/reservations')}
            >
              我的预约
            </Button>
            <Button
              onClick={() => router.push('/dashboard/upload')}
              style={{ backgroundColor: '#B8966E', color: 'white' }}
            >
              上传小票
            </Button>
          </div>
        </div>

        {/* 预约规则提醒 */}
        <div className="border border-[#B8966E]/50 bg-amber-50/60 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-stone-800">预约十分重要</p>
            <p className="text-sm text-stone-700">
              购物前请先预约商家和日期,只有与<strong>已通过</strong>的预约信息一致的购物小票可以申请返点。
            </p>
          </div>
          <button
            onClick={() => router.push('/dashboard/reservations')}
            className="text-sm text-[#B8966E] hover:underline whitespace-nowrap"
          >
            去预约 →
          </button>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: '已提交小票', value: total > 0 ? String(total) : '—' },
            { label: '待审核', value: pending > 0 ? String(pending) : '—' },
            {
              label: '总返点',
              value: totalCashback > 0 ? `€${totalCashback.toFixed(2)}` : '—',
            },
          ].map((stat) => (
            <div key={stat.label} className="card-luxury space-y-2">
              <p className="text-xs tracking-widest uppercase text-muted">{stat.label}</p>
              <p className="text-2xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* 待确认返点金额 */}
        {awaiting.length > 0 && (
          <div className="card-luxury border-[#B8966E]/50">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs tracking-widest uppercase text-muted">待确认返点金额</p>
              <span className="text-xs text-[#B8966E]">{awaiting.length} 张</span>
            </div>
            <p className="text-xs text-stone-500 mb-5">
              审核已通过,请仔细核对返点金额是否无误。确认后金额不可更改,随后可选择结算方式。
            </p>
            <div className="space-y-3">
              {awaiting.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-50 pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-stone-700">{inv.vendorName ?? '—'}</p>
                    <p className="text-xs text-stone-500">
                      {inv.purchaseDate ? new Date(inv.purchaseDate).toLocaleDateString('zh-CN') : '—'}
                      {inv.grandTotalAmount && ` · 消费 €${Number(inv.grandTotalAmount).toFixed(2)}`}
                      {inv.disputeResolutionNote && ' · 已复核'}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-[#B8966E]">
                      €{Number(inv.cashbackAmount ?? 0).toFixed(2)}
                    </span>
                    <Button
                      size="sm"
                      onClick={() => router.push(`/dashboard/invoices/${inv.id}/confirm`)}
                      style={{ backgroundColor: '#B8966E', color: 'white' }}
                    >
                      核对并确认
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 选择结算方式与结算记录 */}
        {accessToken && <SettlementSection accessToken={accessToken} />}

        {/* 小票列表 */}
        <div className="card-luxury">
          <div className="flex items-center justify-between mb-6">
            <p className="text-xs tracking-widest uppercase text-muted">最近小票</p>
            {invoices.length > 0 && (
              <button
                onClick={loadInvoices}
                className="text-xs text-[#B8966E] hover:underline"
              >
                刷新
              </button>
            )}
          </div>

          {invoicesLoading ? (
            <div className="text-center py-10 text-muted text-sm">加载中…</div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-muted text-sm">暂无小票。</p>
              <button
                onClick={() => router.push('/dashboard/upload')}
                className="text-sm text-[#B8966E] hover:underline"
              >
                上传第一张小票 →
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-xs text-muted uppercase tracking-wider">
                    <th className="text-left pb-3 font-normal">门店</th>
                    <th className="text-left pb-3 font-normal">发票号</th>
                    <th className="text-left pb-3 font-normal">日期</th>
                    <th className="text-right pb-3 font-normal">金额</th>
                    <th className="text-right pb-3 font-normal">返点</th>
                    <th className="text-right pb-3 font-normal">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-stone-50 hover:bg-stone-50/60 cursor-pointer"
                      onClick={() => router.push(`/dashboard/invoices/${inv.id}`)}
                    >
                      <td className="py-3 pr-4 max-w-[180px] truncate text-stone-700">
                        {inv.vendorName ?? '—'}
                      </td>
                      <td className="py-3 pr-4 text-stone-600 text-xs font-mono">
                        {inv.invoiceNumber ?? '—'}
                      </td>
                      <td className="py-3 pr-4 text-stone-500 text-xs">
                        {inv.purchaseDate
                          ? new Date(inv.purchaseDate).toLocaleDateString('zh-CN')
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 text-right text-stone-700">
                        {inv.grandTotalAmount
                          ? `${inv.currency ?? ''} ${Number(inv.grandTotalAmount).toFixed(2)}`
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {inv.cashbackAmount ? (
                          <span className={inv.status === 'CONFIRMED' ? 'text-[#B8966E]' : 'text-stone-400'}>
                            €{Number(inv.cashbackAmount).toFixed(2)}
                            {(inv.status === 'PENDING' || inv.status === 'DISPUTED') && (
                              <span className="text-[10px] ml-0.5">预估</span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-3 text-right">
                        <Badge variant={STATUS_VARIANT[inv.status] ?? 'outline'}>
                          {STATUS_LABEL[inv.status] ?? inv.status}
                        </Badge>
                        {inv.status === 'REJECTED' && inv.rejectReason && (
                          <p className="text-[11px] text-red-600 mt-1 max-w-[180px] ml-auto">
                            {inv.rejectReason}
                          </p>
                        )}
                        {inv.status === 'PENDING' && !inv.ocrCompletedAt && (
                          <p className="text-[11px] text-stone-400 mt-1">识别中…</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
