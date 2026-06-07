'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '@/lib/auth-context';
import { adminApi, ReconciliationRow, DrillDownRow, MerchantBill } from '@/lib/api';
import { toast } from 'sonner';

type ParsedRow = Record<string, string>;
type FieldMap = { merchantName: string; date: string; totalAmount: string };

export default function AdminReconciliationPage() {
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<ReconciliationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [drillDown, setDrillDown] = useState<{ key: string; rows: DrillDownRow[] } | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  const [importing, setImporting] = useState(false);
  const [bills, setBills] = useState<MerchantBill[]>([]);
  const [showImport, setShowImport] = useState(false);

  // Excel upload state
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fieldMap, setFieldMap] = useState<FieldMap>({ merchantName: '', date: '', totalAmount: '' });
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Advanced (JSON) mode
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [importText, setImportText] = useState('');

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    parseFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    parseFile(file);
  };

  const parseFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonRows: ParsedRow[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (jsonRows.length === 0) {
          toast.error('File is empty or unreadable');
          return;
        }
        const headers = Object.keys(jsonRows[0]);
        setParsedHeaders(headers);
        setParsedRows(jsonRows);
        // Auto-detect columns by common names
        const autoMatch = (candidates: string[]) =>
          headers.find((h) => candidates.some((c) => h.toLowerCase().includes(c))) ?? '';
        setFieldMap({
          merchantName: autoMatch(['merchant', 'store', 'shop', 'vendor', 'retailer']),
          date: autoMatch(['date', 'jour', 'datum', 'fecha']),
          totalAmount: autoMatch(['total', 'amount', 'montant', 'price', 'sum']),
        });
      } catch {
        toast.error('Failed to parse file');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const resetFile = () => {
    setParsedHeaders([]);
    setParsedRows([]);
    setFieldMap({ merchantName: '', date: '', totalAmount: '' });
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const mappingComplete = fieldMap.merchantName && fieldMap.date && fieldMap.totalAmount;

  const handleExcelImport = async () => {
    if (!accessToken || !mappingComplete) return;
    setImporting(true);
    try {
      const payload = parsedRows.map((r) => ({
        merchantName: String(r[fieldMap.merchantName] ?? '').trim(),
        date: String(r[fieldMap.date] ?? '').trim(),
        totalAmount: parseFloat(String(r[fieldMap.totalAmount] ?? '0').replace(/[^0-9.-]/g, '')),
      })).filter((b) => b.merchantName && b.date && !isNaN(b.totalAmount));

      if (payload.length === 0) {
        toast.error('No valid rows found after mapping');
        return;
      }
      const result = await adminApi.importMerchantBills(accessToken, payload);
      toast.success(`Imported ${result.imported} bill(s)`);
      resetFile();
      loadBills();
      loadReconciliation();
    } catch (e: any) {
      toast.error(e.message ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleJsonImport = async () => {
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
            onClick={() => { setShowImport((v) => !v); resetFile(); }}
            className="px-3 py-1.5 text-sm bg-[#B8966E] text-white rounded hover:bg-[#a07d5a]"
          >
            Import Bills
          </button>
        </div>
      </div>

      {/* Import panel */}
      {showImport && (
        <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-4">
          {/* File Upload Step */}
          {parsedHeaders.length === 0 ? (
            <div>
              <p className="text-sm font-medium text-stone-700 mb-3">
                Upload a merchant bill file (.xlsx, .xls, .csv)
              </p>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-stone-200 rounded-lg p-8 text-center cursor-pointer hover:border-[#B8966E] hover:bg-stone-50 transition-colors"
              >
                <div className="text-3xl mb-2">📂</div>
                <p className="text-sm text-stone-500">
                  Drag &amp; drop a file here, or <span className="text-[#B8966E] underline">browse</span>
                </p>
                <p className="text-xs text-stone-400 mt-1">.xlsx · .xls · .csv</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          ) : (
            /* Field Mapping Step */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-stone-700">
                  Map columns — <span className="font-normal text-stone-500">{fileName}</span>
                </p>
                <button onClick={resetFile} className="text-xs text-stone-400 hover:text-stone-600 underline">
                  Change file
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {(['merchantName', 'date', 'totalAmount'] as const).map((field) => {
                  const labels: Record<string, string> = {
                    merchantName: 'Merchant Name',
                    date: 'Date',
                    totalAmount: 'Total Amount',
                  };
                  return (
                    <div key={field}>
                      <label className="block text-xs font-medium text-stone-500 mb-1">
                        {labels[field]}
                      </label>
                      <select
                        value={fieldMap[field]}
                        onChange={(e) => setFieldMap((prev) => ({ ...prev, [field]: e.target.value }))}
                        className="w-full border border-stone-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-[#B8966E]"
                      >
                        <option value="">— select column —</option>
                        {parsedHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {/* Preview */}
              {mappingComplete && (
                <div>
                  <p className="text-xs text-stone-400 mb-2">Preview (first 5 rows)</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-stone-100 text-stone-400">
                          <th className="text-left py-1 pr-4">Merchant</th>
                          <th className="text-left py-1 pr-4">Date</th>
                          <th className="text-right py-1">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedRows.slice(0, 5).map((r, i) => (
                          <tr key={i} className="border-b border-stone-50">
                            <td className="py-1 pr-4 text-stone-600">{String(r[fieldMap.merchantName])}</td>
                            <td className="py-1 pr-4 text-stone-500">{String(r[fieldMap.date])}</td>
                            <td className="py-1 text-right text-stone-700">{String(r[fieldMap.totalAmount])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-stone-400 mt-1">{parsedRows.length} row(s) total</p>
                </div>
              )}

              <button
                onClick={handleExcelImport}
                disabled={importing || !mappingComplete}
                className="px-4 py-2 bg-[#B8966E] text-white text-sm rounded hover:bg-[#a07d5a] disabled:opacity-50"
              >
                {importing ? 'Importing…' : `Confirm & Import (${parsedRows.length} rows)`}
              </button>
            </div>
          )}

          {/* Advanced mode — JSON paste */}
          <div className="border-t border-stone-100 pt-3">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1"
            >
              <span>{showAdvanced ? '▾' : '▸'}</span>
              Advanced mode (paste JSON)
            </button>
            {showAdvanced && (
              <div className="mt-3 space-y-2">
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
                  onClick={handleJsonImport}
                  disabled={importing}
                  className="px-4 py-2 bg-[#B8966E] text-white text-sm rounded hover:bg-[#a07d5a] disabled:opacity-50"
                >
                  {importing ? 'Importing…' : 'Import JSON'}
                </button>
              </div>
            )}
          </div>

          {/* Existing bills list */}
          {bills.length > 0 && (
            <div className="border-t border-stone-100 pt-3">
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
                  <Fragment key={key}>
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
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
