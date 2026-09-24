'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { adminApi, type AdminMerchant } from '@/lib/api';

const INPUT = 'w-full border border-stone-200 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:border-[#B8966E]';

export default function AdminMerchantsPage() {
  const { accessToken } = useAuth();
  const [rows, setRows] = useState<AdminMerchant[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newTaxId, setNewTaxId] = useState('');
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editTaxId, setEditTaxId] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      setRows(await adminApi.listMerchants(accessToken));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '加载商家失败');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!accessToken) return;
    if (!newName.trim()) { toast.error('请填写商家名称'); return; }
    if (!newTaxId.trim()) { toast.error('请填写 SIRET 税号'); return; }
    setCreating(true);
    try {
      await adminApi.createMerchant(accessToken, { name: newName.trim(), taxId: newTaxId.trim() });
      toast.success('商家已添加');
      setNewName('');
      setNewTaxId('');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '添加失败');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (m: AdminMerchant) => {
    setEditingId(m.id);
    setEditName(m.name);
    setEditTaxId(m.taxId);
  };

  const handleSave = async (m: AdminMerchant) => {
    if (!accessToken) return;
    if (!editName.trim()) { toast.error('商家名称不能为空'); return; }
    setSavingId(m.id);
    try {
      await adminApi.updateMerchant(accessToken, m.id, {
        name: editName.trim(),
        taxId: editTaxId.trim(),
      });
      toast.success('已保存');
      setEditingId(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSavingId(null);
    }
  };

  const handleToggle = async (m: AdminMerchant) => {
    if (!accessToken) return;
    setSavingId(m.id);
    try {
      await adminApi.updateMerchant(accessToken, m.id, { active: !m.active });
      toast.success(m.active ? '已停用,买手端不再显示' : '已启用');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-800">商家管理</h1>
      <p className="text-sm text-stone-500">
        维护可预约的合作商家。税号为法国 SIRET(14 位数字,印在小票商家地址下方),小票自动匹配就是靠它。
        停用的商家不会出现在买手端下拉框,但历史预约和小票仍保留。
      </p>

      {/* 新增 */}
      <div className="bg-white border border-stone-200 rounded-lg p-4">
        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-3">新增商家</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="商家名称,例如 LA SAMARITAINE"
            className={INPUT}
          />
          <input
            value={newTaxId}
            onChange={(e) => setNewTaxId(e.target.value)}
            placeholder="SIRET,例如 53775858300059"
            className={`${INPUT} font-mono sm:max-w-xs`}
          />
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-5 py-1.5 rounded bg-[#B8966E] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 whitespace-nowrap"
          >
            {creating ? '添加中…' : '添加'}
          </button>
        </div>
      </div>

      {/* 列表 */}
      <div className="bg-white border border-stone-200 rounded-lg overflow-x-auto">
        {loading ? (
          <div className="p-6 text-sm text-stone-400">加载中…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-sm text-stone-400 text-center">还没有商家,请先在上方添加。</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs text-stone-400 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">名称</th>
                <th className="text-left px-4 py-3 font-medium">SIRET</th>
                <th className="text-left px-4 py-3 font-medium">状态</th>
                <th className="text-left px-4 py-3 font-medium">预约数</th>
                <th className="text-right px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const editing = editingId === m.id;
                const busy = savingId === m.id;
                return (
                  <tr key={m.id} className={`border-b border-stone-100 ${m.active ? '' : 'opacity-60'}`}>
                    <td className="px-4 py-3">
                      {editing ? (
                        <input value={editName} onChange={(e) => setEditName(e.target.value)} className={INPUT} />
                      ) : (
                        <span className="text-stone-700">{m.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-stone-600">
                      {editing ? (
                        <input value={editTaxId} onChange={(e) => setEditTaxId(e.target.value)} className={`${INPUT} font-mono`} />
                      ) : (
                        m.taxId
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        m.active ? 'bg-green-50 text-green-700' : 'bg-stone-100 text-stone-500'
                      }`}>
                        {m.active ? '启用' : '停用'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{m._count.reservations}</td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {editing ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleSave(m)}
                            disabled={busy}
                            className="px-3 py-1 rounded bg-[#B8966E] text-white text-xs font-medium disabled:opacity-50"
                          >
                            保存
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            disabled={busy}
                            className="px-3 py-1 rounded border border-stone-200 text-xs text-stone-600 hover:bg-stone-50"
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-3">
                          <button
                            onClick={() => startEdit(m)}
                            disabled={busy}
                            className="text-xs text-[#B8966E] hover:underline disabled:opacity-50"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => handleToggle(m)}
                            disabled={busy}
                            className={`text-xs hover:underline disabled:opacity-50 ${
                              m.active ? 'text-red-600' : 'text-green-700'
                            }`}
                          >
                            {m.active ? '停用' : '启用'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
