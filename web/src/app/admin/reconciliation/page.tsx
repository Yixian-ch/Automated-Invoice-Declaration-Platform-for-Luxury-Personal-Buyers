'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '@/lib/auth-context';
import { adminApi, ReconciliationRow, DrillDownRow, MerchantBill } from '@/lib/api';
import { toast } from 'sonner';

type ParsedRow = Record<string, string>;
type FieldMap = { merchantName: string; date: string; totalAmount: string };

type UnifiedRow = {
  id: string;
  merchantName: string;
  date: string;
  billTotal: number;
  invoicesTotal: number;
  status: 'MATCH' | 'MISMATCH';
  hasInvoices: boolean;
};

export default function AdminReconciliationPage() {
  const { accessToken } = useAuth();
  const [reconcRows, setReconcRows] = useState<ReconciliationRow[]>([]);
  const [bills, setBills] = useState<MerchantBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [drillDown, setDrillDown] = useState<{ key: string; rows: DrillDownRow[] } | null>(null);
  const [drillLoading, setDrillLoading] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);

  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fieldMap, setFieldMap] = useState<FieldMap>({ merchantName: '', date: '', totalAmount: '' });
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [importText, setImportText] = useState('');

  const loadAll = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const [reconcData, billsData] = await Promise.all([
        adminApi.getReconciliation(accessToken).catch(() => [] as ReconciliationRow[]),
        adminApi.listMerchantBills(accessToken).catch(() => [] as MerchantBill[]),
      ]);
      setReconcRows(reconcData);
      setBills(billsData);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [accessToken]);

  const unifiedRows = useMemo<UnifiedRow[]>(() => {
    const reconcMap = new Map<string, ReconciliationRow>();
    for (const row of reconcRows) {
      reconcMap.set(`${row.merchant_name}|${row.invoice_date}`, row);
    }

    return bills
      .map((bill) => {
        const dateStr = bill.date.slice(0, 10);
        const reconcRow = reconcMap.get(`${bill.merchantName}|${dateStr}`);

        const billTotal = Number(bill.totalAmount);
        const invoicesTotal = reconcRow ? Number(reconcRow.invoices_total) : 0;

        const isMatch =
          reconcRow !== undefined &&
          billTotal > 0 &&
          Math.abs(invoicesTotal - billTotal) / billTotal <= 0.01;

        return {
          id: bill.id,
          merchantName: bill.merchantName,
          date: dateStr,
          billTotal,
          invoicesTotal,
          status: isMatch ? ('MATCH' as const) : ('MISMATCH' as const),
          hasInvoices: reconcRow !== undefined,
        };
      })
      .sort((a, b) => {
        if (a.status !== b.status) return a.status === 'MISMATCH' ? -1 : 1;
        return b.date.localeCompare(a.date);
      });
  }, [bills, reconcRows]);

  const handleDrillDown = async (row: UnifiedRow) => {
    const key = `${row.merchantName}|${row.date}`;
    if (drillDown?.key === key) { setDrillDown(null); return; }
    if (!accessToken) return;
    setDrillLoading(true);
    try {
      const data = await adminApi.getDrillDown(accessToken, row.merchantName, row.date);
      setDrillDown({ key, rows: data });
    } catch {
      toast.error('加载交易记录失败');
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
        if (jsonRows.length === 0) { toast.error('文件为空或无法读取'); return; }
        const headers = Object.keys(jsonRows[0]);
        setParsedHeaders(headers);
        setParsedRows(jsonRows);
        const autoMatch = (candidates: string[]) =>
          headers.find((h) => candidates.some((c) => h.toLowerCase().includes(c))) ?? '';
        setFieldMap({
          merchantName: autoMatch(['merchant', 'store', 'shop', 'vendor', 'retailer', '商家', '门店']),
          date: autoMatch(['date', 'jour', 'datum', 'fecha', '日期']),
          totalAmount: autoMatch(['total', 'amount', 'montant', 'price', 'sum', '金额', '总额']),
        });
      } catch {
        toast.error('文件解析失败');
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
      const payload = parsedRows
        .map((r) => ({
          merchantName: String(r[fieldMap.merchantName] ?? '').trim(),
          date: String(r[fieldMap.date] ?? '').trim(),
          totalAmount: parseFloat(String(r[fieldMap.totalAmount] ?? '0').replace(/[^0-9.-]/g, '')),
        }))
        .filter((b) => b.merchantName && b.date && !isNaN(b.totalAmount));

      if (payload.length === 0) { toast.error('映射后无有效数据行'); return; }
      const result = await adminApi.importMerchantBills(accessToken, payload);
      toast.success(`成功导入 ${result.imported} 条账单`);
      resetFile();
      setShowImport(false);
      loadAll();
    } catch (e: any) {
      toast.error(e.message ?? '导入失败');
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
      toast.success(`成功导入 ${result.imported} 条账单`);
      setImportText('');
      setShowImport(false);
      loadAll();
    } catch (e: any) {
      toast.error(e.message ?? 'JSON 格式有误或导入失败');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">账单核对</h1>
          <p className="text-sm text-stone-500 mt-1">
            将提交的小票与商家官方账单数据进行比对。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadAll}
            className="px-3 py-1.5 text-sm border border-stone-200 rounded hover:bg-stone-50"
          >
            刷新
          </button>
          <button
            onClick={() => { setShowImport((v) => !v); resetFile(); }}
            className="px-3 py-1.5 text-sm bg-[#B8966E] text-white rounded hover:bg-[#a07d5a]"
          >
            导入账单
          </button>
        </div>
      </div>

      {/* 导入面板 */}
      {showImport && (
        <div className="bg-white border border-stone-200 rounded-lg p-5 space-y-4">
          {parsedHeaders.length === 0 ? (
            <div>
              <p className="text-sm font-medium text-stone-700 mb-3">
                上传商家账单文件（.xlsx、.xls、.csv）
              </p>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-stone-200 rounded-lg p-8 text-center cursor-pointer hover:border-[#B8966E] hover:bg-stone-50 transition-colors"
              >
                <div className="text-3xl mb-2">📂</div>
                <p className="text-sm text-stone-500">
                  拖拽文件至此处，或<span className="text-[#B8966E] underline">点击浏览</span>
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
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-stone-700">
                  字段映射 — <span className="font-normal text-stone-500">{fileName}</span>
                </p>
                <button onClick={resetFile} className="text-xs text-stone-400 hover:text-stone-600 underline">
                  重新选择
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {(['merchantName', 'date', 'totalAmount'] as const).map((field) => {
                  const labels: Record<string, string> = {
                    merchantName: '商家名称',
                    date: '日期',
                    totalAmount: '总金额',
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
                        <option value="">— 选择列 —</option>
                        {parsedHeaders.map((h) => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              {mappingComplete && (
                <div>
                  <p className="text-xs text-stone-400 mb-2">预览（前 5 行）</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-stone-100 text-stone-400">
                          <th className="text-left py-1 pr-4">商家</th>
                          <th className="text-left py-1 pr-4">日期</th>
                          <th className="text-right py-1">总金额</th>
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
                  <p className="text-xs text-stone-400 mt-1">共 {parsedRows.length} 行</p>
                </div>
              )}

              <button
                onClick={handleExcelImport}
                disabled={importing || !mappingComplete}
                className="px-4 py-2 bg-[#B8966E] text-white text-sm rounded hover:bg-[#a07d5a] disabled:opacity-50"
              >
                {importing ? '导入中…' : `确认导入（${parsedRows.length} 行）`}
              </button>
            </div>
          )}

          {/* 高级模式 — JSON 粘贴 */}
          <div className="border-t border-stone-100 pt-3">
            <button
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1"
            >
              <span>{showAdvanced ? '▾' : '▸'}</span>
              高级模式（粘贴 JSON）
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
                  placeholder="在此粘贴 JSON…"
                />
                <button
                  onClick={handleJsonImport}
                  disabled={importing}
                  className="px-4 py-2 bg-[#B8966E] text-white text-sm rounded hover:bg-[#a07d5a] disabled:opacity-50"
                >
                  {importing ? '导入中…' : '导入 JSON'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 对账总表 */}
      <div className="bg-white border border-stone-200 rounded-lg overflow-x-auto">
        {loading ? (
          <div className="p-6 text-sm text-stone-400">加载中…</div>
        ) : unifiedRows.length === 0 ? (
          <div className="p-8 text-center text-stone-400 text-sm">
            尚未导入任何账单。点击"导入账单"开始。
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50 text-xs text-stone-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">商家</th>
                <th className="text-left px-4 py-3 font-medium">日期</th>
                <th className="text-right px-4 py-3 font-medium">小票合计</th>
                <th className="text-right px-4 py-3 font-medium">账单总额</th>
                <th className="text-center px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {unifiedRows.map((row) => {
                const key = `${row.merchantName}|${row.date}`;
                const isOpen = drillDown?.key === key;
                const isMismatch = row.status === 'MISMATCH';
                return (
                  <Fragment key={key}>
                    <tr className={`border-b border-stone-100 ${isMismatch ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3 text-stone-700">{row.merchantName}</td>
                      <td className="px-4 py-3 text-stone-500">{row.date}</td>
                      <td className="px-4 py-3 text-right text-stone-700">
                        €{row.invoicesTotal.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right text-stone-700">
                        €{row.billTotal.toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isMismatch ? (
                          <span className="text-red-600 font-medium">🔴 不匹配</span>
                        ) : (
                          <span className="text-green-600 font-medium">🟢 已匹配</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.hasInvoices && isMismatch && (
                          <button
                            onClick={() => handleDrillDown(row)}
                            className="text-xs text-[#B8966E] underline hover:no-underline"
                          >
                            {isOpen ? '收起' : '查看明细'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${key}-drill`} className="bg-red-50/60">
                        <td colSpan={6} className="px-4 py-3">
                          {drillLoading ? (
                            <p className="text-sm text-stone-400">加载中…</p>
                          ) : drillDown?.rows.length === 0 ? (
                            <p className="text-sm text-stone-400">暂无交易记录。</p>
                          ) : (
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-stone-200 text-stone-400">
                                  <th className="text-left py-1 pr-4">买手</th>
                                  <th className="text-left py-1 pr-4">邮箱</th>
                                  <th className="text-left py-1 pr-4">文件</th>
                                  <th className="text-right py-1 pr-4">金额</th>
                                  <th className="text-right py-1">返点</th>
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
