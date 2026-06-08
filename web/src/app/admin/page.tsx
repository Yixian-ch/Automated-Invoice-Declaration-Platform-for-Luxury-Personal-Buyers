'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { adminApi, AdminInvoice } from '@/lib/api';
import { toast } from 'sonner';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export default function AdminReviewPage() {
  const { accessToken } = useAuth();
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [selected, setSelected] = useState<AdminInvoice | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [correction, setCorrection] = useState<{
    vendorName: string;
    purchaseDate: string;
    grandTotalAmount: string;
  } | null>(null);
  const [correcting, setCorrecting] = useState(false);

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const result = await adminApi.listInvoices(accessToken, { status: 'PENDING', page: 1 });
      const all = result.items;
      setInvoices(all);
      if (selected) {
        const refreshed = all.find((i) => i.id === selected.id);
        setSelected(refreshed ?? null);
      }
    } catch (e) {
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [accessToken]);
  useEffect(() => {
    setImgError(false);
    if (selected?.needsReview) {
      setCorrection({
        vendorName: selected.vendorName ?? '',
        purchaseDate: selected.purchaseDate
          ? selected.purchaseDate.slice(0, 10)
          : '',
        grandTotalAmount: selected.grandTotalAmount ?? '',
      });
    } else {
      setCorrection(null);
    }
  }, [selected?.id]);

  const handleApprove = async () => {
    if (!accessToken || !selected) return;
    setActing(true);
    try {
      await adminApi.approve(accessToken, selected.id, note || undefined);
      toast.success('Invoice approved');
      setSelected(null);
      setNote('');
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to approve');
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!accessToken || !selected) return;
    if (!note.trim()) { toast.error('A rejection reason is required'); return; }
    setActing(true);
    try {
      await adminApi.reject(accessToken, selected.id, note);
      toast.success('Invoice rejected');
      setSelected(null);
      setNote('');
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to reject');
    } finally {
      setActing(false);
    }
  };

  const handleCorrect = async () => {
    if (!accessToken || !selected || !correction) return;
    setCorrecting(true);
    try {
      await adminApi.correctInvoice(accessToken, selected.id, {
        vendorName: correction.vendorName || undefined,
        purchaseDate: correction.purchaseDate || undefined,
        grandTotalAmount: correction.grandTotalAmount || undefined,
      });
      toast.success('Corrections saved');
      setCorrection(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to save corrections');
    } finally {
      setCorrecting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-800">Invoice Review</h1>
      <p className="text-sm text-stone-500">Manually approve or reject invoices pending review.</p>

      <div className="flex gap-6 h-[calc(100vh-160px)]">
        {/* Left: invoice list */}
        <div className="w-72 shrink-0 bg-white border border-stone-200 rounded-lg overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-stone-400">Loading…</div>
          ) : invoices.length === 0 ? (
            <div className="p-6 text-sm text-stone-400 text-center">No invoices pending review.</div>
          ) : (
            invoices.map((inv) => (
              <button
                key={inv.id}
                onClick={() => { setSelected(inv); setNote(''); }}
                className={`w-full text-left px-4 py-3 border-b border-stone-100 hover:bg-amber-50 transition-colors ${
                  selected?.id === inv.id ? 'bg-amber-50 border-l-2 border-l-[#B8966E]' : ''
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-stone-700 truncate">
                    {inv.originalFilename ?? inv.id.slice(0, 8)}
                  </p>
                  {inv.needsReview && (
                    <span className="shrink-0 text-[10px] font-semibold text-white bg-red-500 rounded px-1 py-0.5 leading-none">
                      需人工介入
                    </span>
                  )}
                </div>
                <p className="text-xs text-stone-400 mt-0.5">
                  {inv.user.firstName} {inv.user.lastName}
                </p>
                <p className="text-xs text-stone-500 mt-0.5">
                  {inv.grandTotalAmount ? `€${Number(inv.grandTotalAmount).toFixed(2)}` : '—'}
                </p>
              </button>
            ))
          )}
        </div>

        {/* Right: detail view */}
        {selected ? (
          <div className="flex-1 bg-white border border-stone-200 rounded-lg flex gap-0 overflow-hidden">
            {/* Invoice image */}
            <div className="w-1/2 border-r border-stone-100 bg-stone-50 flex items-center justify-center p-4 overflow-auto">
              {imgError ? (
                <div className="text-center space-y-2 text-stone-400">
                  <p className="text-4xl">🧾</p>
                  <p className="text-sm">Image not available</p>
                  {selected.originalFilename && (
                    <p className="text-xs text-stone-400">{selected.originalFilename}</p>
                  )}
                </div>
              ) : (
                <img
                  src={`${API_BASE}/api/v1/invoices/${selected.id}/image`}
                  alt="Invoice"
                  className="max-w-full max-h-full object-contain rounded shadow"
                  onError={() => setImgError(true)}
                />
              )}
            </div>

            {/* Extracted data + actions */}
            <div className="w-1/2 p-6 flex flex-col gap-4 overflow-y-auto">
              <div>
                <h2 className="text-base font-semibold text-stone-800 mb-3">Extracted Data</h2>
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      ['Merchant', selected.vendorName ?? '—'],
                      ['Date', selected.purchaseDate ? new Date(selected.purchaseDate).toLocaleDateString('fr-FR') : '—'],
                      ['Amount', selected.grandTotalAmount ? `${selected.currency ?? ''} ${Number(selected.grandTotalAmount).toFixed(2)}` : '—'],
                      ['Brand', selected.brandName ?? '—'],
                      ['OCR Confidence', selected.ocrConfidence != null ? `${(selected.ocrConfidence * 100).toFixed(0)}%` : '—'],
                      ['Buyer', `${selected.user.firstName} ${selected.user.lastName}`],
                      ['Email', selected.user.email],
                      ['Status', selected.status],
                    ].map(([label, value]) => (
                      <tr key={label} className="border-b border-stone-50">
                        <td className="py-1.5 pr-4 text-stone-400 whitespace-nowrap">{label}</td>
                        <td className="py-1.5 text-stone-700 font-medium">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {correction && (
                <div className="border border-amber-200 rounded-lg p-4 bg-amber-50 space-y-3">
                  <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                    手动更正
                  </p>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs text-stone-500 mb-0.5">门店名</label>
                      <input
                        type="text"
                        value={correction.vendorName}
                        onChange={(e) =>
                          setCorrection((c) => c && { ...c, vendorName: e.target.value })
                        }
                        className="w-full border border-stone-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#B8966E]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-500 mb-0.5">日期</label>
                      <input
                        type="date"
                        value={correction.purchaseDate}
                        onChange={(e) =>
                          setCorrection((c) => c && { ...c, purchaseDate: e.target.value })
                        }
                        className="w-full border border-stone-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#B8966E]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-500 mb-0.5">总金额</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={correction.grandTotalAmount}
                        onChange={(e) =>
                          setCorrection((c) => c && { ...c, grandTotalAmount: e.target.value })
                        }
                        className="w-full border border-stone-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#B8966E]"
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleCorrect}
                    disabled={correcting}
                    className="w-full py-1.5 rounded bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                  >
                    {correcting ? '保存中…' : '保存更正'}
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs text-stone-500 mb-1">
                  Note <span className="text-red-400">(required for rejection)</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full border border-stone-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#B8966E]"
                  placeholder="Optional approval note or rejection reason…"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={handleApprove}
                  disabled={acting}
                  className="flex-1 py-2 rounded bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  ✓ Approve
                </button>
                <button
                  onClick={handleReject}
                  disabled={acting}
                  className="flex-1 py-2 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  ✗ Reject
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-white border border-stone-200 rounded-lg flex items-center justify-center text-stone-400 text-sm">
            Select an invoice to review
          </div>
        )}
      </div>
    </div>
  );
}
