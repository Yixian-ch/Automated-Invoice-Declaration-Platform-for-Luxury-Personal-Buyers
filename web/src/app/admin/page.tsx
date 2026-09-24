'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { adminApi, AdminInvoice, LineItem, DISPUTE_CATEGORY_LABEL, formatParisDate } from '@/lib/api';
import { toast } from 'sonner';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const INPUT = 'w-full border border-stone-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#B8966E]';

type EditableLine = {
  description: string;
  brand: string;
  itemCategory: string;
  quantity: string;
  amount_ttc: string;
};

type Correction = {
  vendorName: string;
  purchaseDate: string;
  grandTotalAmount: string;
  lineItems: EditableLine[];
};

function toEditable(items: LineItem[] | null | undefined): EditableLine[] {
  return (items ?? []).map((li) => ({
    description: li.description ?? '',
    brand: li.brand ?? '',
    itemCategory: li.itemCategory ?? '',
    quantity: li.quantity != null ? String(li.quantity) : '1',
    amount_ttc: li.amount_ttc != null ? String(li.amount_ttc) : '0',
  }));
}

/** 跨用户条形码撞号的风控标记 */
function crossUserDuplicate(inv: AdminInvoice): { invoiceId: string; userId: string }[] | null {
  const flag = (inv.fraudFlags as { duplicateBarcode?: { sameUser?: boolean; invoices?: { invoiceId: string; userId: string }[] } } | null)?.duplicateBarcode;
  if (!flag || flag.sameUser || !flag.invoices?.length) return null;
  return flag.invoices;
}

export default function AdminReviewPage() {
  const { accessToken } = useAuth();
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [selected, setSelected] = useState<AdminInvoice | null>(null);
  const [note, setNote] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [correction, setCorrection] = useState<Correction | null>(null);
  const [correcting, setCorrecting] = useState(false);

  const load = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      // 人工队列 = 待审核 + 金额异议(后端按 needsReview 优先排序)
      const result = await adminApi.listInvoices(accessToken, { status: 'PENDING,DISPUTED', page: 1 });
      const all = result.items;
      setInvoices(all);
      if (selected) {
        const refreshed = all.find((i) => i.id === selected.id);
        setSelected(refreshed ?? null);
      }
    } catch {
      toast.error('加载小票失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [accessToken]);
  useEffect(() => {
    setImgError(false);
    setResolutionNote('');
    if (selected && (selected.needsReview || selected.status === 'DISPUTED')) {
      setCorrection({
        vendorName: selected.vendorName ?? '',
        purchaseDate: selected.purchaseDate ? selected.purchaseDate.slice(0, 10) : '',
        grandTotalAmount: selected.grandTotalAmount ?? '',
        lineItems: toEditable(selected.lineItems as LineItem[] | null),
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
      toast.success('小票已通过,等待客户确认返点金额');
      setSelected(null);
      setNote('');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '审批失败');
    } finally {
      setActing(false);
    }
  };

  const handleReject = async () => {
    if (!accessToken || !selected) return;
    if (!note.trim()) { toast.error('拒绝时必须填写原因'); return; }
    setActing(true);
    try {
      await adminApi.reject(accessToken, selected.id, note);
      toast.success('小票已拒绝');
      setSelected(null);
      setNote('');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '拒绝失败');
    } finally {
      setActing(false);
    }
  };

  const handleResolveDispute = async () => {
    if (!accessToken || !selected) return;
    setActing(true);
    try {
      const updated = await adminApi.resolveDispute(accessToken, selected.id, resolutionNote.trim());
      toast.success(`已重新核算:返点 €${Number(updated.cashbackAmount ?? 0).toFixed(2)},等待客户确认`);
      setSelected(null);
      setResolutionNote('');
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '复核失败');
    } finally {
      setActing(false);
    }
  };

  const handleDelete = async (invoiceId: string) => {
    if (!accessToken) return;
    if (!window.confirm('确认删除这张小票？此操作不可撤销。')) return;
    try {
      await adminApi.deleteInvoice(accessToken, invoiceId);
      toast.success('小票已删除');
      if (selected?.id === invoiceId) setSelected(null);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '删除小票失败');
    }
  };

  const handleCorrect = async () => {
    if (!accessToken || !selected || !correction) return;
    for (const li of correction.lineItems) {
      if (!li.description.trim()) { toast.error('商品描述不能为空'); return; }
      if (!(Number(li.amount_ttc) >= 0)) { toast.error('商品金额不合法'); return; }
    }
    setCorrecting(true);
    try {
      const updated = await adminApi.correctInvoice(accessToken, selected.id, {
        vendorName: correction.vendorName || undefined,
        purchaseDate: correction.purchaseDate || undefined,
        grandTotalAmount: correction.grandTotalAmount || undefined,
        lineItems: correction.lineItems.map((li) => ({
          description: li.description.trim(),
          brand: li.brand.trim() || null,
          itemCategory: li.itemCategory.trim() || null,
          quantity: Math.max(1, parseInt(li.quantity, 10) || 1),
          amount_ttc: Number(li.amount_ttc) || 0,
        })),
      });
      toast.success(`更正已保存,按规则重算返点 €${Number(updated.cashbackAmount ?? 0).toFixed(2)}`);
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存更正失败');
    } finally {
      setCorrecting(false);
    }
  };

  const updateLine = (index: number, field: keyof EditableLine, value: string) =>
    setCorrection((c) => c && {
      ...c,
      lineItems: c.lineItems.map((li, i) => (i === index ? { ...li, [field]: value } : li)),
    });

  const isDisputed = selected?.status === 'DISPUTED';
  const crossDup = selected ? crossUserDuplicate(selected) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-800">小票审核</h1>
      <p className="text-sm text-stone-500">
        自动审核(照片清晰度 → 条形码去重 → 预约匹配)通过的小票在此人工审批;客户提出金额异议的小票也会回到这里。
      </p>

      <div className="flex gap-6 h-[calc(100vh-160px)]">
        {/* 左侧:小票列表 */}
        <div className="w-72 shrink-0 bg-white border border-stone-200 rounded-lg overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-stone-400">加载中…</div>
          ) : invoices.length === 0 ? (
            <div className="p-6 text-sm text-stone-400 text-center">暂无待审核小票。</div>
          ) : (
            invoices.map((inv) => {
              const dup = crossUserDuplicate(inv);
              return (
                <div key={inv.id} className="relative group border-b border-stone-100">
                  <button
                    onClick={() => { setSelected(inv); setNote(''); }}
                    className={`w-full text-left px-4 py-3 hover:bg-amber-50 transition-colors ${
                      selected?.id === inv.id ? 'bg-amber-50 border-l-2 border-l-[#B8966E]' : ''
                    } ${inv.status === 'DISPUTED' || dup ? 'bg-orange-50/40' : ''}`}
                  >
                    <div className="flex items-center gap-1.5 pr-6 flex-wrap">
                      <p className="text-sm font-medium text-stone-700 truncate max-w-[140px]">
                        {inv.vendorName ?? inv.originalFilename ?? inv.id.slice(0, 8)}
                      </p>
                      {inv.status === 'DISPUTED' && (
                        <span className="shrink-0 text-[10px] font-semibold text-white bg-orange-500 rounded px-1 py-0.5 leading-none">
                          金额异议
                        </span>
                      )}
                      {dup && (
                        <span className="shrink-0 text-[10px] font-semibold text-white bg-purple-600 rounded px-1 py-0.5 leading-none">
                          疑似小票共享
                        </span>
                      )}
                      {inv.needsReview && inv.status !== 'DISPUTED' && !dup && (
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
                      {inv.cashbackAmount ? ` · 返点 €${Number(inv.cashbackAmount).toFixed(2)}` : ''}
                    </p>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(inv.id); }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-stone-300 hover:text-red-500 text-xs px-1"
                    title="删除小票"
                  >
                    ✕
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* 右侧:详情视图 */}
        {selected ? (
          <div className="flex-1 bg-white border border-stone-200 rounded-lg flex gap-0 overflow-hidden">
            {/* 小票图片 */}
            <div className="w-1/2 border-r border-stone-100 bg-stone-50 flex items-center justify-center p-4 overflow-auto">
              {imgError ? (
                <div className="text-center space-y-2 text-stone-400">
                  <p className="text-4xl">🧾</p>
                  <p className="text-sm">图片不可用</p>
                  {selected.originalFilename && (
                    <p className="text-xs text-stone-400">{selected.originalFilename}</p>
                  )}
                </div>
              ) : (
                <img
                  src={`${API_BASE}/api/v1/invoices/${selected.id}/image`}
                  alt="小票"
                  className="max-w-full max-h-full object-contain rounded shadow"
                  onError={() => setImgError(true)}
                />
              )}
            </div>

            {/* 识别数据 + 操作 */}
            <div className="w-1/2 p-6 flex flex-col gap-4 overflow-y-auto">
              {/* 金额异议面板 */}
              {isDisputed && (
                <div className="border border-orange-200 rounded-lg p-4 bg-orange-50 space-y-1">
                  <p className="text-xs font-semibold text-orange-800 uppercase tracking-wide">客户金额异议</p>
                  <p className="text-sm text-stone-800">
                    <span className="font-medium">
                      {selected.disputeCategory ? DISPUTE_CATEGORY_LABEL[selected.disputeCategory] : '—'}
                    </span>
                    {selected.disputeReason ? `:${selected.disputeReason}` : ''}
                  </p>
                  <p className="text-xs text-stone-500">
                    第 {selected.disputeCount ?? 1} 次异议
                    {selected.disputedAt && ` · ${new Date(selected.disputedAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}`}
                    {' · '}当前返点 €{Number(selected.cashbackAmount ?? 0).toFixed(2)}
                  </p>
                </div>
              )}

              {/* 风控标记 */}
              {crossDup && (
                <div className="border border-purple-200 rounded-lg p-4 bg-purple-50 space-y-1">
                  <p className="text-xs font-semibold text-purple-800 uppercase tracking-wide">风控:条形码与其他用户重复</p>
                  <p className="text-xs text-stone-600">
                    条形码 <span className="font-mono">{selected.invoiceNumber}</span> 也出现在以下用户的活跃小票中,疑似小票共享/倒卖,请核实后再通过:
                  </p>
                  <ul className="text-xs text-stone-600 font-mono list-disc pl-4">
                    {crossDup.map((d) => (
                      <li key={d.invoiceId}>小票 {d.invoiceId.slice(0, 8)}… · 用户 {d.userId.slice(0, 8)}…</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h2 className="text-base font-semibold text-stone-800 mb-3">识别数据</h2>
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      ['门店', selected.vendorName ?? '—'],
                      ['小票号(条形码)', selected.invoiceNumber ?? '—'],
                      ['匹配商家', selected.matchedMerchant ? `${selected.matchedMerchant.name}(${selected.matchedMerchant.taxId})` : '—'],
                      ['匹配预约', selected.reservation ? `${formatParisDate(selected.reservation.startAt)} ~ ${formatParisDate(selected.reservation.endAt)}` : '—'],
                      ['日期', selected.purchaseDate ? new Date(selected.purchaseDate).toLocaleDateString('zh-CN') : '—'],
                      ['金额', selected.grandTotalAmount ? `${selected.currency ?? ''} ${Number(selected.grandTotalAmount).toFixed(2)}` : '—'],
                      ['预估返点', selected.cashbackAmount ? `€${Number(selected.cashbackAmount).toFixed(2)}` : '—'],
                      ['照片置信度', selected.imageQuality != null ? `${(selected.imageQuality * 100).toFixed(0)}%` : '—'],
                      ['字段完整度', selected.ocrConfidence != null ? `${(selected.ocrConfidence * 100).toFixed(0)}%` : '—'],
                      ['买手', `${selected.user.firstName} ${selected.user.lastName}`],
                      ['邮箱', selected.user.email],
                      ['状态', selected.status],
                    ].map(([label, value]) => (
                      <tr key={label} className="border-b border-stone-50">
                        <td className="py-1.5 pr-4 text-stone-400 whitespace-nowrap">{label}</td>
                        <td className="py-1.5 text-stone-700 font-medium">{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {selected.needsReview && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">
                      需人工介入
                    </span>
                    {(selected.reviewReasons ?? []).map((r) => (
                      <span key={r} className="inline-block px-2 py-0.5 rounded text-xs bg-red-50 text-red-600">
                        {r}
                      </span>
                    ))}
                  </div>
                )}

                {!correction && selected.lineItems && (selected.lineItems as LineItem[]).length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">行项目</h3>
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-stone-200 text-stone-400 uppercase tracking-wider">
                          <th className="text-left py-1.5 pr-3 font-medium">商品描述</th>
                          <th className="text-left py-1.5 pr-3 font-medium">品牌</th>
                          <th className="text-right py-1.5 pr-3 font-medium">数量</th>
                          <th className="text-right py-1.5 font-medium">含税金额</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selected.lineItems as LineItem[]).map((item, i) => (
                          <tr key={i} className="border-b border-stone-50">
                            <td className="py-1.5 pr-3 text-stone-700">{item.description}</td>
                            <td className="py-1.5 pr-3 text-stone-500">{item.brand ?? '—'}</td>
                            <td className="py-1.5 pr-3 text-right text-stone-600">
                              {item.quantity != null ? item.quantity : '—'}
                            </td>
                            <td className="py-1.5 text-right text-stone-700">
                              {item.amount_ttc != null
                                ? `${selected.currency ?? '€'} ${Number(item.amount_ttc).toFixed(2)}`
                                : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button
                      onClick={() => setCorrection({
                        vendorName: selected.vendorName ?? '',
                        purchaseDate: selected.purchaseDate ? selected.purchaseDate.slice(0, 10) : '',
                        grandTotalAmount: selected.grandTotalAmount ?? '',
                        lineItems: toEditable(selected.lineItems as LineItem[]),
                      })}
                      className="mt-2 text-xs text-[#B8966E] hover:underline"
                    >
                      更正识别数据
                    </button>
                  </div>
                )}
              </div>

              {correction && (
                <div className="border border-amber-200 rounded-lg p-4 bg-amber-50 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                      更正识别数据
                    </p>
                    <span className="text-[11px] text-amber-700">返点由规则按更正后的数据重算,不可手动填写</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-stone-500 mb-0.5">门店名</label>
                      <input
                        type="text"
                        value={correction.vendorName}
                        onChange={(e) => setCorrection((c) => c && { ...c, vendorName: e.target.value })}
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-500 mb-0.5">日期</label>
                      <input
                        type="date"
                        value={correction.purchaseDate}
                        onChange={(e) => setCorrection((c) => c && { ...c, purchaseDate: e.target.value })}
                        className={INPUT}
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-500 mb-0.5">总金额</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={correction.grandTotalAmount}
                        onChange={(e) => setCorrection((c) => c && { ...c, grandTotalAmount: e.target.value })}
                        className={INPUT}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-stone-500">商品明细(品牌/分类决定返点比例)</label>
                      <button
                        onClick={() => setCorrection((c) => c && {
                          ...c,
                          lineItems: [...c.lineItems, { description: '', brand: '', itemCategory: '', quantity: '1', amount_ttc: '0' }],
                        })}
                        className="text-xs text-[#B8966E] hover:underline"
                      >
                        + 添加一行
                      </button>
                    </div>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-stone-400">
                          <th className="text-left pb-1 font-normal">描述</th>
                          <th className="text-left pb-1 font-normal w-24">品牌</th>
                          <th className="text-left pb-1 font-normal w-20">分类</th>
                          <th className="text-left pb-1 font-normal w-12">数量</th>
                          <th className="text-left pb-1 font-normal w-24">含税金额</th>
                          <th className="w-6"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {correction.lineItems.map((li, i) => (
                          <tr key={i}>
                            <td className="pr-1 pb-1"><input value={li.description} onChange={(e) => updateLine(i, 'description', e.target.value)} className={INPUT} /></td>
                            <td className="pr-1 pb-1"><input value={li.brand} onChange={(e) => updateLine(i, 'brand', e.target.value)} className={INPUT} placeholder="DIOR" /></td>
                            <td className="pr-1 pb-1"><input value={li.itemCategory} onChange={(e) => updateLine(i, 'itemCategory', e.target.value)} className={INPUT} placeholder="bag" /></td>
                            <td className="pr-1 pb-1"><input type="number" min="1" value={li.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} className={INPUT} /></td>
                            <td className="pr-1 pb-1"><input type="number" step="0.01" min="0" value={li.amount_ttc} onChange={(e) => updateLine(i, 'amount_ttc', e.target.value)} className={INPUT} /></td>
                            <td className="pb-1">
                              <button
                                onClick={() => setCorrection((c) => c && { ...c, lineItems: c.lineItems.filter((_, j) => j !== i) })}
                                className="text-stone-300 hover:text-red-500"
                                title="删除此行"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleCorrect}
                      disabled={correcting}
                      className="flex-1 py-1.5 rounded bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
                    >
                      {correcting ? '保存中…' : '保存更正并重算返点'}
                    </button>
                    {!selected.needsReview && !isDisputed && (
                      <button
                        onClick={() => setCorrection(null)}
                        disabled={correcting}
                        className="px-3 py-1.5 rounded border border-stone-200 text-sm text-stone-600 hover:bg-stone-50"
                      >
                        取消
                      </button>
                    )}
                  </div>
                </div>
              )}

              {isDisputed ? (
                <div className="border border-orange-200 rounded-lg p-4 bg-white space-y-3">
                  <p className="text-xs font-semibold text-orange-800 uppercase tracking-wide">处理异议</p>
                  <p className="text-xs text-stone-500">
                    如识别数据有误,请先在上方更正并保存(返点自动重算);然后填写复核说明并返回客户确认。维持原金额时说明必填。
                  </p>
                  <textarea
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    rows={3}
                    className={INPUT}
                    placeholder="复核说明(展示给客户),例如:已核对小票明细,第 2 行商品为 YSL,按 YSL 返点比例计算无误。"
                  />
                  <button
                    onClick={handleResolveDispute}
                    disabled={acting || correcting}
                    className="w-full py-2 rounded bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
                  >
                    按规则重算并返回客户确认
                  </button>
                  <details className="text-xs text-stone-500">
                    <summary className="cursor-pointer">其他操作(拒绝该小票)</summary>
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        className={INPUT}
                        placeholder="拒绝原因(必填,买手可见)"
                      />
                      <button
                        onClick={handleReject}
                        disabled={acting}
                        className="w-full py-1.5 rounded bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                      >
                        ✗ 拒绝
                      </button>
                    </div>
                  </details>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">
                      备注 <span className="text-red-400">（拒绝时必填）</span>
                    </label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      className={INPUT}
                      placeholder="填写通过备注或拒绝原因…"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleApprove}
                      disabled={acting}
                      className="flex-1 py-2 rounded bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      ✓ 通过(待客户确认金额)
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={acting}
                      className="flex-1 py-2 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                    >
                      ✗ 拒绝
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 bg-white border border-stone-200 rounded-lg flex items-center justify-center text-stone-400 text-sm">
            请从左侧选择一张小票
          </div>
        )}
      </div>
    </div>
  );
}
