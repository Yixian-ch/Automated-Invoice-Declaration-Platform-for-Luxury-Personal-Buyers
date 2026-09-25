'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

const NAV = [
  { href: '/admin', label: '小票审核' },
  { href: '/admin/reservations', label: '预约审核' },
  { href: '/admin/merchants', label: '商家管理' },
  { href: '/admin/data', label: '数据总览' },
  { href: '/admin/reconciliation', label: '账单核对' },
  { href: '/admin/cashback-rates', label: '返点管理' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    // 未登录(含退出登录后)→ 登录页;已登录但不是管理员 → 买手工作台
    if (!user) router.replace('/login');
    else if (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN') router.replace('/dashboard');
  }, [user, isLoading, router]);

  if (isLoading || !user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) return null;

  return (
    <div className="min-h-screen flex bg-[#FAF9F7]">
      {/* Sidebar */}
      <aside className="w-52 shrink-0 bg-white border-r border-stone-200 flex flex-col">
        <div className="px-5 py-5 border-b border-stone-100">
          <p className="text-xs tracking-[0.2em] uppercase text-stone-400">LIDP 管理后台</p>
        </div>
        <nav className="flex-1 py-4 space-y-0.5">
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-5 py-2.5 text-sm transition-colors ${
                  active
                    ? 'bg-amber-50 text-[#B8966E] font-medium border-r-2 border-[#B8966E]'
                    : 'text-stone-600 hover:bg-stone-50'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-stone-100 space-y-2">
          <p className="text-xs text-stone-400 truncate" title={user.email}>{user.email}</p>
          <button
            onClick={logout}
            className="text-sm text-stone-600 hover:text-red-600 transition-colors"
          >
            退出登录
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
