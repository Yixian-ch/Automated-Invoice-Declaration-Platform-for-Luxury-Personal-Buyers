'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { adminApi, AdminUser } from '@/lib/api';

export default function AdminCashbackRatesPage() {
  const { accessToken } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [editedRates, setEditedRates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadUsers = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const data = await adminApi.listUsers(accessToken);
      setUsers(data);
      setEditedRates(
        Object.fromEntries(data.map((user) => [user.id, user.cashbackRate ?? '0'])),
      );
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [accessToken]);

  const handleRateChange = (userId: string, value: string) => {
    setEditedRates((prev) => ({ ...prev, [userId]: value }));
  };

  const handleSave = async (user: AdminUser) => {
    if (!accessToken) return;
    const rawValue = editedRates[user.id]?.trim() ?? '';
    const numericValue = Number(rawValue);

    if (rawValue === '' || Number.isNaN(numericValue)) {
      toast.error('Enter a valid cashback rate');
      return;
    }
    if (numericValue < 0 || numericValue > 1) {
      toast.error('Cashback rate must be between 0 and 1');
      return;
    }

    setSavingId(user.id);
    try {
      const updated = await adminApi.updateCashbackRate(accessToken, user.id, numericValue);
      setUsers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      toast.success('Cashback rate updated');
    } catch (error: any) {
      toast.error(error?.message ?? 'Failed to save cashback rate');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-stone-800">Cashback Rate Settings</h1>
        <p className="text-sm text-stone-500">Manage buyer cashback percentages for approved invoices.</p>
      </div>

      <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
        <table className="min-w-full divide-y divide-stone-200 text-sm">
          <thead className="bg-stone-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-stone-500">Buyer</th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">Email</th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">Cashback Rate</th>
              <th className="px-4 py-3 text-left font-medium text-stone-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-200">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-stone-400">
                  Loading buyers…
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-stone-400">
                  No buyer users found.
                </td>
              </tr>
            ) : (
              users.map((user) => {
                const currentRate = editedRates[user.id] ?? user.cashbackRate ?? '0';
                const isDirty = currentRate !== (user.cashbackRate ?? '0');
                return (
                  <tr key={user.id}>
                    <td className="px-4 py-4 text-stone-700">{user.firstName} {user.lastName}</td>
                    <td className="px-4 py-4 text-stone-500">{user.email}</td>
                    <td className="px-4 py-4">
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        max="1"
                        value={currentRate}
                        onChange={(e) => handleRateChange(user.id, e.target.value)}
                        className="w-28 rounded border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700 focus:border-[#B8966E] focus:outline-none"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <button
                        type="button"
                        disabled={!isDirty || savingId === user.id}
                        onClick={() => handleSave(user)}
                        className="rounded bg-[#B8966E] px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingId === user.id ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
