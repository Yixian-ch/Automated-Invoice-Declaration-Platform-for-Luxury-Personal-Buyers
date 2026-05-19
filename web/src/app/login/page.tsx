'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-10">

        {/* Header */}
        <div className="text-center space-y-3">
          <Link href="/" className="text-xs tracking-[0.3em] uppercase text-muted hover:text-ink transition-colors">
            LIDP
          </Link>
          <h1 className="text-4xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
            Sign In
          </h1>
          <div className="w-8 h-px bg-gold mx-auto" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card-luxury space-y-5">
          {error && (
            <p className="text-xs text-error border border-error/20 bg-error/5 px-4 py-3">
              {error}
            </p>
          )}

          <div className="space-y-1">
            <label className="text-xs tracking-widest uppercase text-muted" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-luxury"
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs tracking-widest uppercase text-muted" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input-luxury"
              placeholder="••••••••"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-muted">
          New to the platform?{' '}
          <Link href="/register" className="text-ink underline underline-offset-4 hover:text-gold transition-colors">
            Register with invite code
          </Link>
        </p>
      </div>
    </main>
  );
}
