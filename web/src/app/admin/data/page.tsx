'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { adminApi, AdminInvoice, InvoiceStatus } from '@/lib/api';
import { toast } from 'sonner';

const ALL_STATUSES: InvoiceStatus[] = [
  'PENDING_UPLOAD', 'UPLOADED', 'OCR_PROCESSING', 'OCR_DONE',
  'FRAUD_REVIEW', 'APPROVED', 'REJECTED', 'BLACKLISTED',
];

export default function AdminDataPage() {
  const { accessToken } = useAuth();
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [page, setPage] = useState(1);

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await adminApi.listInvoices(accessToken, {
        status: statusFilter || undefined,
        userId: userIdFilter.trim() || undefined,
        page,
      });
      setInvoices(res.items);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [accessToken, statusFilter, userIdFilter, page]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-800">Data Table</h1>
      <p className="text-sm text-stone-500">Read-only view of all invoice records.</p>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="border border-stone-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#B8966E]"
        >
          <option value="">All statuses</option>
          {ALL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="text"
          placeholder="Filter by buyer ID…"
          value={userIdFilter}
          onChange={(e) => { setUserIdFilter(e.target.value); setPage(1); }}
          className="border border-stone-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-[#B8966E] w-64"
        />
        <span className="self-center text-xs text-stone-400">{total} records</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-stone-200 rounded-lg overflow-x-auto">
        {loading ? (
          <div className="p-6 text-sm text-stone-400">Loading…</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-xs text-stone-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">ID</th>
                <th className="text-left px-4 py-3 font-medium">Buyer</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Merchant</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
                <th className="text-right px-4 py-3 font-medium">Cashback</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-stone-400">No records</td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-stone-50 hover:bg-stone-50/60">
                    <td className="px-4 py-2.5 text-xs text-stone-400 font-mono">{inv.id.slice(0, 8)}…</td>
                    <td className="px-4 py-2.5 text-stone-700">{inv.user.firstName} {inv.user.lastName}</td>
                    <td className="px-4 py-2.5 text-stone-500 text-xs">{inv.user.email}</td>
                    <td className="px-4 py-2.5 text-stone-600">{inv.vendorName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-stone-500 text-xs">
                      {inv.purchaseDate ? new Date(inv.purchaseDate).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-stone-700">
                      {inv.grandTotalAmount ? `€${Number(inv.grandTotalAmount).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[#B8966E]">
                      {inv.cashbackAmount ? `€${Number(inv.cashbackAmount).toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        inv.status === 'APPROVED' ? 'bg-green-50 text-green-700' :
                        inv.status === 'REJECTED' ? 'bg-red-50 text-red-700' :
                        inv.status === 'BLACKLISTED' ? 'bg-red-100 text-red-900' :
                        'bg-stone-100 text-stone-600'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex gap-2 items-center">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="px-3 py-1 text-sm border border-stone-200 rounded disabled:opacity-40"
        >
          ← Prev
        </button>
        <span className="text-sm text-stone-500">Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={invoices.length < 50}
          className="px-3 py-1 text-sm border border-stone-200 rounded disabled:opacity-40"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
