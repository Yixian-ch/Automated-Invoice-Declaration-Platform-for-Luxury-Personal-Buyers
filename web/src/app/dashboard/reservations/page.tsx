'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import {
  reservationApi,
  formatParisDate,
  todayInParis,
  type MerchantOption,
  type Reservation,
  type ReservationStatus,
} from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NameWatermark } from '@/components/name-watermark';

const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING: '审核中',
  ACCEPTED: '已通过',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
};

const STATUS_VARIANT: Record<ReservationStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING: 'outline',
  ACCEPTED: 'default',
  REJECTED: 'destructive',
  CANCELLED: 'secondary',
};

export default function ReservationsPage() {
  const { user, isLoading, logout, accessToken } = useAuth();
  const router = useRouter();

  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const today = todayInParis();
  const [merchantId, setMerchantId] = useState('');
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [submitting, setSubmitting] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setListLoading(true);
    try {
      const [m, r] = await Promise.all([
        reservationApi.merchants(accessToken),
        reservationApi.list(accessToken),
      ]);
      setMerchants(m);
      setReservations(r);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '加载预约失败');
    } finally {
      setListLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
  }, [user, isLoading, router]);

  useEffect(() => {
    if (user && accessToken) load();
  }, [user, accessToken, load]);

  const handleCreate = async () => {
    if (!accessToken) return;
    if (!merchantId) { toast.error('请选择商家'); return; }
    if (!startDate || !endDate) { toast.error('请选择起止日期'); return; }
    if (startDate < today) { toast.error('起始日不能早于今天(巴黎时间)'); return; }
    if (endDate < startDate) { toast.error('结束日不能早于起始日'); return; }

    setSubmitting(true);
    try {
      await reservationApi.create(accessToken, { merchantId, startDate, endDate });
      toast.success('预约已提交,等待后台确认');
      setMerchantId('');
      setStartDate(today);
      setEndDate(today);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '预约失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (r: Reservation) => {
    if (!accessToken) return;
    if (!window.confirm(`确认取消 ${r.merchant.name} ${formatParisDate(r.startAt)} ~ ${formatParisDate(r.endAt)} 的预约?取消后该时段的小票将无法申请返点。`)) return;
    setCancellingId(r.id);
    try {
      await reservationApi.cancel(accessToken, r.id);
      toast.success('预约已取消');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '取消失败');
    } finally {
      setCancellingId(null);
    }
  };

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="w-px h-10 bg-gold animate-pulse" />
      </main>
    );
  }

  const active = reservations.filter((r) => r.status === 'PENDING' || r.status === 'ACCEPTED');
  const history = reservations.filter((r) => r.status === 'REJECTED' || r.status === 'CANCELLED');

  return (
    <main className="relative min-h-screen flex flex-col">
      <NameWatermark />
      <header className="relative z-10 border-b border-border px-8 py-4 flex items-center justify-between">
        <span className="text-sm tracking-[0.2em] uppercase" style={{ fontFamily: 'var(--font-serif)' }}>
          LIDP
        </span>
        <nav className="flex items-center gap-6">
          <span className="text-xs text-muted">
            {user.firstName} {user.lastName}
          </span>
          <button onClick={() => router.push('/dashboard')} className="btn-ghost text-xs">
            工作台
          </button>
          <button onClick={logout} className="btn-ghost text-xs">
            退出
          </button>
        </nav>
      </header>

      <div className="relative z-10 flex-1 px-8 py-12 max-w-5xl mx-auto w-full space-y-10">
        <div>
          <button onClick={() => router.push('/dashboard')} className="btn-ghost text-xs mb-6 flex items-center gap-1">
            ← 返回工作台
          </button>
          <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
            我的预约
          </h1>
          <div className="w-8 h-px bg-gold mt-3" />
        </div>

        {/* 预约规则提醒 */}
        <div className="border border-[#B8966E]/50 bg-amber-50/60 px-6 py-4 space-y-1.5">
          <p className="text-sm font-medium text-stone-800">预约十分重要</p>
          <p className="text-sm text-stone-700">
            只有与<strong>已通过</strong>的预约信息(商家 + 购物日期)一致的购物小票才可以申请返点。
            非预约时间或非预约商铺购物的小票会被自动拒绝,不予返点。
          </p>
          <p className="text-xs text-muted">
            预约日期按巴黎时间计算。同一商家在同一时段只能有一条审核中或已通过的预约,如需更改请先取消再重新预约。
          </p>
        </div>

        {/* 新建预约 */}
        <div className="card-luxury space-y-6">
          <p className="text-xs tracking-widest uppercase text-muted">新建预约</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="block text-xs text-muted">商家</label>
              <select
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                className="input-luxury"
                disabled={merchants.length === 0}
              >
                <option value="">{merchants.length === 0 ? '暂无可预约商家' : '请选择商家'}</option>
                {merchants.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs text-muted">起始日(巴黎时间)</label>
              <input
                type="date"
                value={startDate}
                min={today}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (endDate < e.target.value) setEndDate(e.target.value);
                }}
                className="input-luxury"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs text-muted">结束日(巴黎时间)</label>
              <input
                type="date"
                value={endDate}
                min={startDate || today}
                onChange={(e) => setEndDate(e.target.value)}
                className="input-luxury"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleCreate}
              disabled={submitting || merchants.length === 0}
              style={{ backgroundColor: '#B8966E', color: 'white' }}
            >
              {submitting ? '提交中…' : '提交预约'}
            </Button>
          </div>
        </div>

        {/* 预约列表 */}
        <div className="card-luxury">
          <div className="flex items-center justify-between mb-6">
            <p className="text-xs tracking-widest uppercase text-muted">当前预约</p>
            <button onClick={load} className="text-xs text-[#B8966E] hover:underline">刷新</button>
          </div>
          {listLoading ? (
            <div className="text-center py-10 text-muted text-sm">加载中…</div>
          ) : active.length === 0 ? (
            <div className="text-center py-10 text-muted text-sm">暂无审核中或已通过的预约。</div>
          ) : (
            <ReservationTable
              rows={active}
              cancellingId={cancellingId}
              onCancel={handleCancel}
            />
          )}
        </div>

        {history.length > 0 && (
          <div className="card-luxury">
            <p className="text-xs tracking-widest uppercase text-muted mb-6">历史记录</p>
            <ReservationTable rows={history} />
          </div>
        )}
      </div>
    </main>
  );
}

function ReservationTable({
  rows,
  cancellingId,
  onCancel,
}: {
  rows: Reservation[];
  cancellingId?: string | null;
  onCancel?: (r: Reservation) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-stone-100 text-xs text-muted uppercase tracking-wider">
            <th className="text-left pb-3 font-normal">商家</th>
            <th className="text-left pb-3 font-normal">预约期间</th>
            <th className="text-left pb-3 font-normal">状态</th>
            <th className="text-left pb-3 font-normal">备注</th>
            {onCancel && <th className="text-right pb-3 font-normal"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-stone-50">
              <td className="py-3 pr-4 text-stone-700">{r.merchant.name}</td>
              <td className="py-3 pr-4 text-stone-600 text-xs font-mono">
                {formatParisDate(r.startAt)} ~ {formatParisDate(r.endAt)}
              </td>
              <td className="py-3 pr-4">
                <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
              </td>
              <td className="py-3 pr-4 text-xs text-stone-500">
                {r.status === 'REJECTED' && r.rejectNote ? r.rejectNote : ''}
                {r.status === 'CANCELLED' && r.cancelledAt
                  ? `取消于 ${new Date(r.cancelledAt).toLocaleDateString('zh-CN')}`
                  : ''}
                {r.status === 'PENDING' ? '等待后台确认' : ''}
              </td>
              {onCancel && (
                <td className="py-3 text-right">
                  <button
                    onClick={() => onCancel(r)}
                    disabled={cancellingId === r.id}
                    className="text-xs text-red-600 hover:underline disabled:opacity-50"
                  >
                    {cancellingId === r.id ? '取消中…' : '取消预约'}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
