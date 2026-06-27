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
      const user = await login(email, password);
      if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') {
        router.push('/admin');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
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
            登录
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
              邮箱
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
              密码
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
            {loading ? '登录中…' : '登录'}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-muted">
          还没有账户？{' '}
          <Link href="/register" className="text-ink underline underline-offset-4 hover:text-gold transition-colors">
            使用邀请码注册
          </Link>
        </p>
      </div>
    </main>
  );
}
