'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

export default function DashboardPage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
    if (!isLoading && user && user.kycStatus === 'NOT_STARTED') router.push('/onboarding');
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="w-px h-10 bg-gold animate-pulse" />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Nav */}
      <header className="border-b border-border px-8 py-4 flex items-center justify-between">
        <span className="text-sm tracking-[0.2em] uppercase" style={{ fontFamily: 'var(--font-serif)' }}>
          LIDP
        </span>
        <nav className="flex items-center gap-6">
          <span className="text-xs text-muted">
            {user.firstName} {user.lastName}
          </span>
          <button onClick={logout} className="btn-ghost text-xs">
            Sign out
          </button>
        </nav>
      </header>

      {/* Content */}
      <div className="flex-1 px-8 py-12 max-w-5xl mx-auto w-full space-y-10">

        {/* KYC status banner */}
        {user.kycStatus !== 'APPROVED' && (
          <div className="border border-warning/30 bg-warning/5 px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-warning">Identity Verification Required</p>
              <p className="text-xs text-muted mt-0.5">
                Complete KYC verification to start uploading invoices.
              </p>
            </div>
            <a href="/onboarding" className="btn-primary text-xs px-4 py-2 whitespace-nowrap">
              Verify Identity
            </a>
          </div>
        )}

        <div>
          <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
            Dashboard
          </h1>
          <div className="w-8 h-px bg-gold mt-3" />
        </div>

        {/* Stat cards — placeholder for Phase 2 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Invoices Submitted', value: '—' },
            { label: 'Pending Review', value: '—' },
            { label: 'Total Cashback', value: '—' },
          ].map((stat) => (
            <div key={stat.label} className="card-luxury space-y-2">
              <p className="text-xs tracking-widest uppercase text-muted">{stat.label}</p>
              <p className="text-2xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* Invoice table placeholder */}
        <div className="card-luxury">
          <p className="text-xs tracking-widest uppercase text-muted mb-6">Recent Invoices</p>
          <div className="text-center py-12 text-muted text-sm">
            Invoice upload will be available in Phase 2.
          </div>
        </div>
      </div>
    </main>
  );
}
