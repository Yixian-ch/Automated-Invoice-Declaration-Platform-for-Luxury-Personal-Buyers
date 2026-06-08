'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { adminApi, AdminInvoice, InvoiceStatus, LineItem } from '@/lib/api';
import { toast } from 'sonner';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const ALL_STATUSES: InvoiceStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

export default function AdminDataPage() {
  const { accessToken } = useAuth();
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AdminInvoice | null>(null);
  const [imgError, setImgError] = useState(false);

  const handleDelete = async (invoiceId: string) => {
    if (!accessToken) return;
    if (!window.confirm('确认删除这张小票？此操作不可撤销。')) return;
    try {
      await adminApi.deleteInvoice(accessToken, invoiceId);
      toast.success('Invoice deleted');
      if (detail?.id === invoiceId) setDetail(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to delete invoice');
    }
  };

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

  const openDetail = (inv: AdminInvoice) => {
    setImgError(false);
    setDetail(inv);
  };

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
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-stone-400">No records</td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-stone-50 hover:bg-stone-50/60 cursor-pointer"
                    onClick={() => openDetail(inv)}
                  >
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
                        'bg-stone-100 text-stone-600'
                      }`}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDelete(inv.id)}
                        className="text-stone-300 hover:text-red-500 transition-colors text-xs"
                        title="Delete invoice"
                      >
                        ✕
                      </button>
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

      {/* Detail side panel */}
      {detail && (
        <div className="fixed inset-0 z-50 flex">
          <div
            className="flex-1 bg-black/30"
            onClick={() => setDetail(null)}
          />
          <div className="w-[520px] bg-white shadow-2xl flex flex-col overflow-y-auto">
            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h2 className="text-base font-semibold text-stone-800">Invoice Detail</h2>
              <button
                onClick={() => setDetail(null)}
                className="text-stone-400 hover:text-stone-700 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Receipt image */}
            <div className="bg-stone-50 border-b border-stone-100 flex items-center justify-center p-4 min-h-[240px]">
              {imgError ? (
                <div className="text-center space-y-2 text-stone-400">
                  <p className="text-4xl">🧾</p>
                  <p className="text-sm">Image not available</p>
                  {detail.originalFilename && (
                    <p className="text-xs text-stone-400">{detail.originalFilename}</p>
                  )}
                </div>
              ) : (
                <img
                  src={`${API_BASE}/api/v1/invoices/${detail.id}/image`}
                  alt="Invoice"
                  onError={() => setImgError(true)}
                  className="max-h-[360px] max-w-full object-contain rounded shadow"
                />
              )}
            </div>

            {/* Extracted data */}
            <div className="px-6 py-4 space-y-4">
              <div>
                <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Extracted Data</h3>
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      ['Store', detail.vendorName ?? '—'],
                      ['Date', detail.purchaseDate ? new Date(detail.purchaseDate).toLocaleDateString('fr-FR') : '—'],
                      ['Amount', detail.grandTotalAmount ? `${detail.currency ?? '€'} ${Number(detail.grandTotalAmount).toFixed(2)}` : '—'],
                      ['OCR Confidence', detail.ocrConfidence != null ? `${(detail.ocrConfidence * 100).toFixed(0)}%` : '—'],
                      ['Buyer', `${detail.user.firstName} ${detail.user.lastName}`],
                      ['Email', detail.user.email],
                      ['Status', detail.status],
                    ].map(([label, value]) => (
                      <tr key={label} className="border-b border-stone-50">
                        <td className="py-1.5 pr-4 text-stone-400 whitespace-nowrap text-xs">{label}</td>
                        <td className="py-1.5 text-stone-700 font-medium text-sm">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {detail.needsReview && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700 border border-red-200">
                      需人工介入
                    </span>
                    {(detail.reviewReasons ?? []).map((r) => (
                      <span key={r} className="inline-block px-2 py-0.5 rounded text-xs bg-red-50 text-red-600">
                        {r}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Line items */}
              {detail.lineItems && (detail.lineItems as LineItem[]).length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Line Items</h3>
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-400 uppercase tracking-wider">
                        <th className="text-left py-1.5 pr-3 font-medium">Description</th>
                        <th className="text-right py-1.5 pr-3 font-medium">Quantité</th>
                        <th className="text-right py-1.5 font-medium">Montant TTC</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.lineItems as LineItem[]).map((item, i) => (
                        <tr key={i} className="border-b border-stone-50">
                          <td className="py-1.5 pr-3 text-stone-700">{item.description}</td>
                          <td className="py-1.5 pr-3 text-right text-stone-600">
                            {item.quantity != null ? item.quantity : '—'}
                          </td>
                          <td className="py-1.5 text-right text-stone-700">
                            {item.amount_ttc != null
                              ? `${detail.currency ?? '€'} ${Number(item.amount_ttc).toFixed(2)}`
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
