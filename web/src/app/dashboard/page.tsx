'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { invoiceApi, type Invoice } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const STATUS_LABEL: Record<string, string> = {
  UPLOADED: '上传成功',
  OCR_PROCESSING: 'OCR 识别中',
  OCR_DONE: '待审核',
  PENDING: '待审核',
  APPROVED: '已通过',
  REJECTED: '已拒绝',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  UPLOADED: 'outline',
  OCR_PROCESSING: 'outline',
  OCR_DONE: 'outline',
  PENDING: 'outline',
  APPROVED: 'default',
  REJECTED: 'destructive',
};

const BYPASS_KYC = process.env.NEXT_PUBLIC_BYPASS_KYC === 'true';

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
    if (!isLoading && user && user.kycStatus === 'NOT_STARTED') router.push('/onboarding');
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

  const approved = invoices.filter((i) => i.status === 'APPROVED').length;
  const pending = invoices.filter((i) => i.status === 'PENDING').length;
  const totalCashback = invoices
    .filter((i) => i.status === 'APPROVED')
    .reduce((sum, i) => sum + (Number(i.cashbackAmount) || 0), 0);

  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="border-b border-border px-8 py-4 flex items-center justify-between">
        <span className="text-sm tracking-[0.2em] uppercase" style={{ fontFamily: 'var(--font-serif)' }}>
          LIDP
        </span>
        <nav className="flex items-center gap-6">
          <span className="text-xs text-muted">
            {user.firstName} {user.lastName}
          </span>
          <button onClick={logout} className="btn-ghost text-xs">
            Sign out
          </button>
        </nav>
      </header>

      {/* Content */}
      <div className="flex-1 px-8 py-12 max-w-5xl mx-auto w-full space-y-10">

        {/* KYC status banner */}
        {!BYPASS_KYC && user.kycStatus !== 'APPROVED' && (
          <div className="border border-warning/30 bg-warning/5 px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-warning">Identity Verification Required</p>
              <p className="text-xs text-muted mt-0.5">
                Complete KYC verification to start uploading invoices.
              </p>
            </div>
            <a href="/onboarding" className="btn-primary text-xs px-4 py-2 whitespace-nowrap">
              Verify Identity
            </a>
          </div>
        )}

        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
              Dashboard
            </h1>
            <div className="w-8 h-px bg-gold mt-3" />
          </div>
          {(BYPASS_KYC || user.kycStatus === 'APPROVED') && (
            <Button
              onClick={() => router.push('/dashboard/upload')}
              style={{ backgroundColor: '#B8966E', color: 'white' }}
            >
              Upload Invoice
            </Button>
          )}
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Invoices Submitted', value: total > 0 ? String(total) : '—' },
            { label: 'Pending Review', value: pending > 0 ? String(pending) : '—' },
            {
              label: 'Total Cashback',
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

        {/* Invoice table */}
        <div className="card-luxury">
          <div className="flex items-center justify-between mb-6">
            <p className="text-xs tracking-widest uppercase text-muted">Recent Invoices</p>
            {invoices.length > 0 && (
              <button
                onClick={loadInvoices}
                className="text-xs text-[#B8966E] hover:underline"
              >
                Refresh
              </button>
            )}
          </div>

          {invoicesLoading ? (
            <div className="text-center py-10 text-muted text-sm">Loading…</div>
          ) : invoices.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-muted text-sm">No invoices yet.</p>
              {(BYPASS_KYC || user.kycStatus === 'APPROVED') && (
                <button
                  onClick={() => router.push('/dashboard/upload')}
                  className="text-sm text-[#B8966E] hover:underline"
                >
                  Upload your first invoice →
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-100 text-xs text-muted uppercase tracking-wider">
                    <th className="text-left pb-3 font-normal">Store</th>
                    <th className="text-left pb-3 font-normal">Items</th>
                    <th className="text-left pb-3 font-normal">Date</th>
                    <th className="text-right pb-3 font-normal">Amount</th>
                    <th className="text-right pb-3 font-normal">Cashback</th>
                    <th className="text-right pb-3 font-normal">Status</th>
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
                      <td className="py-3 pr-4 text-stone-600">
                        {'—'}
                      </td>
                      <td className="py-3 pr-4 text-stone-500 text-xs">
                        {inv.purchaseDate
                          ? new Date(inv.purchaseDate).toLocaleDateString('fr-FR')
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 text-right text-stone-700">
                        {inv.grandTotalAmount
                          ? `${inv.currency ?? ''} ${Number(inv.grandTotalAmount).toFixed(2)}`
                          : '—'}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {inv.cashbackAmount ? (
                          <span className={inv.status === 'APPROVED' ? 'text-[#B8966E]' : 'text-stone-400'}>
                            €{Number(inv.cashbackAmount).toFixed(2)}
                            {inv.status !== 'APPROVED' && (
                              <span className="text-[10px] ml-0.5">预估</span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-3 text-right">
                        <Badge variant={STATUS_VARIANT[inv.status] ?? 'outline'}>
                          {STATUS_LABEL[inv.status] ?? inv.status}
                        </Badge>
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

