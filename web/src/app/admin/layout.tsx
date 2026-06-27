'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

const NAV = [
  { href: '/admin', label: '小票审核' },
  { href: '/admin/data', label: '数据总览' },
  { href: '/admin/reconciliation', label: '账单核对' },
  { href: '/admin/cashback-rates', label: '返点管理' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN'))) {
      router.replace('/dashboard');
    }
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
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">{children}</main>
    </div>
  );
}
