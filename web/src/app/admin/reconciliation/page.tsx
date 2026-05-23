'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { adminApi, ReconciliationRow, DrillDownRow, MerchantBill } from '@/lib/api';
import { toast } from 'sonner';

export default function AdminReconciliationPage() {
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drillDown, setDrillDown] = useState<{ key: string; rows: DrillDownRow[] } | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  // Merchant bill import state
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [bills, setBills] = useState<MerchantBill[]>([]);
  const [showImport, setShowImport] = useState(false);

  const loadReconciliation = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const data = await adminApi.getReconciliation(accessToken);
      setRows(data);
    } catch {
      toast.error('Failed to load reconciliation data');
    } finally {
      setLoading(false);
    }
  };

  const loadBills = async () => {
    if (!accessToken) return;
    const data = await adminApi.listMerchantBills(accessToken).catch(() => []);
    setBills(data);
  };

  useEffect(() => {
    loadReconciliation();
    loadBills();
  }, [accessToken]);

  const handleDrillDown = async (row: ReconciliationRow) => {
    const key = `${row.merchant_name}|${row.invoice_date}`;
    if (drillDown?.key === key) { setDrillDown(null); return; }
    if (!accessToken) return;
    setDrillLoading(true);
    try {
      const data = await adminApi.getDrillDown(accessToken, row.merchant_name, row.invoice_date);
      setDrillDown({ key, rows: data });
    } catch {
      toast.error('Failed to load transactions');
    } finally {
      setDrillLoading(false);
    }
  };

  const handleImport = async () => {
    if (!accessToken || !importText.trim()) return;
    setImporting(true);
    try {
      const parsed = JSON.parse(importText);
      const result = await adminApi.importMerchantBills(accessToken, parsed);
      toast.success(`Imported ${result.imported} bill(s)`);
      setImportText('');
      loadBills();
      loadReconciliation();
    } catch (e: any) {
      toast.error(e.message ?? 'Invalid JSON or import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">Bill Check (Reconciliation)</h1>
          <p className="text-sm text-stone-500 mt-1">
            Compares submitted invoices against official merchant billing data.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadReconciliation}
            className="px-3 py-1.5 text-sm border border-stone-200 rounded hover:bg-stone-50"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowImport((v) => !v)}
            className="px-3 py-1.5 text-sm bg-[#B8966E] text-white rounded hover:bg-[#a07d5a]"
          >
            Import Bills
          </button>
        </div>
      </div>

      {/* Import panel */}
      {showImport && (
        <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-3">
          <p className="text-sm font-medium text-stone-700">
            Paste JSON array of merchant bills:
          </p>
          <pre className="text-xs text-stone-400 bg-stone-50 p-3 rounded">
{`[
  { "merchantName": "Galeries Lafayette", "date": "2026-05-01", "totalAmount": 12500.00 },
  { "merchantName": "Printemps", "date": "2026-05-01", "totalAmount": 8400.00 }
]`}
          </pre>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={5}
            className="w-full border border-stone-200 rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#B8966E]"
            placeholder="Paste JSON here…"
          />
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-4 py-2 bg-[#B8966E] text-white text-sm rounded hover:bg-[#a07d5a] disabled:opacity-50"
          >
            {importing ? 'Importing…' : 'Import'}
          </button>

          {bills.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-stone-500 mb-2">Existing bills ({bills.length})</p>
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-stone-100 text-stone-400">
                    <th className="text-left py-1 pr-4">Merchant</th>
                    <th className="text-left py-1 pr-4">Date</th>
                    <th className="text-right py-1">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => (
                    <tr key={b.id} className="border-b border-stone-50">
                      <td className="py-1 pr-4 text-stone-600">{b.merchantName}</td>
                      <td className="py-1 pr-4 text-stone-500">{new Date(b.date).toLocaleDateString('fr-FR')}</td>
                      <td className="py-1 text-right text-stone-700">€{Number(b.totalAmount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reconciliation table */}
      <div className="bg-white border border-stone-200 rounded-lg overflow-x-auto">
        {loading ? (
          <div className="p-6 text-sm text-stone-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-stone-400 text-sm">
            No reconciliation data. Import merchant bills first, then approve invoices.
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-xs text-stone-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Merchant</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-right px-4 py-3 font-medium">Invoices Total</th>
                <th className="text-right px-4 py-3 font-medium">Bill Total</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const key = `${row.merchant_name}|${row.invoice_date}`;
                const isOpen = drillDown?.key === key;
                const isMismatch = row.status === 'MISMATCH';
                return (
                  <>
                    <tr
                      key={key}
                      className={`border-b border-stone-100 ${isMismatch ? 'bg-red-50' : ''}`}
                    >
                      <td className="px-4 py-3 text-stone-700">{row.merchant_name}</td>
                      <td className="px-4 py-3 text-stone-500">{row.invoice_date}</td>
                      <td className="px-4 py-3 text-right text-stone-700">
                        €{Number(row.invoices_total).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-stone-700">
                        €{Number(row.bill_total).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isMismatch ? (
                          <span className="text-red-600 font-medium">🔴 Mismatch</span>
                        ) : (
                          <span className="text-green-600 font-medium">🟢 Match</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isMismatch && (
                          <button
                            onClick={() => handleDrillDown(row)}
                            className="text-xs text-[#B8966E] underline hover:no-underline"
                          >
                            {isOpen ? 'Hide' : 'View Transactions'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${key}-drill`} className="bg-red-50/60">
                        <td colSpan={6} className="px-4 py-3">
                          {drillLoading ? (
                            <p className="text-sm text-stone-400">Loading…</p>
                          ) : drillDown?.rows.length === 0 ? (
                            <p className="text-sm text-stone-400">No transactions found.</p>
                          ) : (
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-stone-200 text-stone-400">
                                  <th className="text-left py-1 pr-4">Buyer</th>
                                  <th className="text-left py-1 pr-4">Email</th>
                                  <th className="text-left py-1 pr-4">File</th>
                                  <th className="text-right py-1 pr-4">Amount</th>
                                  <th className="text-right py-1">Cashback</th>
                                </tr>
                              </thead>
                              <tbody>
                                {drillDown?.rows.map((tx) => (
                                  <tr key={tx.id} className="border-b border-stone-100">
                                    <td className="py-1.5 pr-4 text-stone-700">
                                      {tx.firstName} {tx.lastName}
                                    </td>
                                    <td className="py-1.5 pr-4 text-stone-500">{tx.email}</td>
                                    <td className="py-1.5 pr-4 text-stone-500 truncate max-w-[140px]">
                                      {tx.originalFilename ?? '—'}
                                    </td>
                                    <td className="py-1.5 pr-4 text-right text-stone-700">
                                      {tx.grandTotalAmount ? `€${Number(tx.grandTotalAmount).toFixed(2)}` : '—'}
                                    </td>
                                    <td className="py-1.5 text-right text-[#B8966E]">
                                      {tx.cashbackAmount ? `€${Number(tx.cashbackAmount).toFixed(2)}` : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
