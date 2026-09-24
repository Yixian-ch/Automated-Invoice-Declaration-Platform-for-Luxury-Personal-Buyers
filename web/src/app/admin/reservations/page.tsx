'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { adminApi, formatParisDate, type AdminReservation, type ReservationStatus } from '@/lib/api';

const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING: '审核中',
  ACCEPTED: '已通过',
  REJECTED: '已拒绝',
  CANCELLED: '客户取消',
};

const STATUS_CLASS: Record<ReservationStatus, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  ACCEPTED: 'bg-green-50 text-green-700',
  REJECTED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-stone-100 text-stone-500',
};

const FILTERS: { value: ReservationStatus | ''; label: string }[] = [
  { value: 'PENDING', label: '审核中' },
  { value: 'ACCEPTED', label: '已通过' },
  { value: 'REJECTED', label: '已拒绝' },
  { value: 'CANCELLED', label: '客户取消' },
  { value: '', label: '全部' },
];

export default function AdminReservationsPage() {
  const { accessToken } = useAuth();
  const [filter, setFilter] = useState<ReservationStatus | ''>('PENDING');
  const [rows, setRows] = useState<AdminReservation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<AdminReservation | null>(null);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await adminApi.listReservations(accessToken, { status: filter, page: 1 });
      setRows(res.items);
      setTotal(res.total);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '加载预约失败');
    } finally {
      setLoading(false);
    }
  }, [accessToken, filter]);

  useEffect(() => { load(); }, [load]);

  const handleAccept = async (r: AdminReservation) => {
    if (!accessToken) return;
    setActingId(r.id);
    try {
      await adminApi.acceptReservation(accessToken, r.id);
      toast.success('预约已通过');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async () => {
    if (!accessToken || !rejecting) return;
    if (!note.trim()) { toast.error('拒绝时必须填写原因'); return; }
    setActingId(rejecting.id);
    try {
      await adminApi.rejectReservation(accessToken, rejecting.id, note.trim());
      toast.success('预约已拒绝');
      setRejecting(null);
      setNote('');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-800">预约审核</h1>
      <p className="text-sm text-stone-500">
        确认或拒绝买手的购物预约。只有已通过的预约才会参与小票自动匹配;预约日期按巴黎时间。
      </p>

      <div className="flex items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded text-sm border transition-colors ${
              filter === f.value
                ? 'bg-[#B8966E] text-white border-[#B8966E]'
                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-stone-400">共 {total} 条</span>
      </div>

      <div className="bg-white border border-stone-200 rounded-lg overflow-x-auto">
        {loading ? (
          <div className="p-6 text-sm text-stone-400">加载中…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-sm text-stone-400 text-center">暂无预约。</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs text-stone-400 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">买手</th>
                <th className="text-left px-4 py-3 font-medium">商家</th>
                <th className="text-left px-4 py-3 font-medium">预约期间</th>
                <th className="text-left px-4 py-3 font-medium">状态</th>
                <th className="text-left px-4 py-3 font-medium">小票</th>
                <th className="text-left px-4 py-3 font-medium">提交时间</th>
                <th className="text-left px-4 py-3 font-medium">备注</th>
                <th className="text-right px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-stone-100 hover:bg-stone-50/60">
                  <td className="px-4 py-3">
                    <p className="text-stone-700">{r.user.firstName} {r.user.lastName}</p>
                    <p className="text-xs text-stone-400">{r.user.email}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-stone-700">{r.merchant.name}</p>
                    <p className="text-xs text-stone-400 font-mono">{r.merchant.taxId}</p>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-stone-600 whitespace-nowrap">
                    {formatParisDate(r.startAt)} ~ {formatParisDate(r.endAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_CLASS[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{r._count.invoices}</td>
                  <td className="px-4 py-3 text-xs text-stone-500 whitespace-nowrap">
                    {new Date(r.createdAt).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-3 text-xs text-stone-500 max-w-[200px]">
                    {r.status === 'REJECTED' ? r.rejectNote ?? '' : ''}
                    {r.status === 'CANCELLED' && r.cancelledAt
                      ? `取消于 ${new Date(r.cancelledAt).toLocaleDateString('zh-CN')}`
                      : ''}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {r.status === 'PENDING' ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleAccept(r)}
                          disabled={actingId === r.id}
                          className="px-3 py-1 rounded bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                          ✓ 通过
                        </button>
                        <button
                          onClick={() => { setRejecting(r); setNote(''); }}
                          disabled={actingId === r.id}
                          className="px-3 py-1 rounded bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
                        >
                          ✗ 拒绝
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-stone-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {rejecting && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 space-y-4">
            <h2 className="text-base font-semibold text-stone-800">拒绝预约</h2>
            <p className="text-sm text-stone-500">
              {rejecting.user.firstName} {rejecting.user.lastName} · {rejecting.merchant.name} ·{' '}
              {formatParisDate(rejecting.startAt)} ~ {formatParisDate(rejecting.endAt)}
            </p>
            <div>
              <label className="block text-xs text-stone-500 mb-1">
                拒绝原因 <span className="text-red-400">(必填,买手可见)</span>
              </label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                autoFocus
                className="w-full border border-stone-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-[#B8966E]"
                placeholder="例如:该日期门店不接待预约"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setRejecting(null); setNote(''); }}
                className="px-4 py-1.5 rounded border border-stone-200 text-sm text-stone-600 hover:bg-stone-50"
              >
                取消
              </button>
              <button
                onClick={handleReject}
                disabled={actingId === rejecting.id}
                className="px-4 py-1.5 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                确认拒绝
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
