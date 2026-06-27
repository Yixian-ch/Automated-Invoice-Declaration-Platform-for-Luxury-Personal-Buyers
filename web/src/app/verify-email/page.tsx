"use client";

export const dynamic = 'force-dynamic';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/api';

type Status = 'verifying' | 'success' | 'error';

export default function VerifyEmailPage() {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('token');
  });
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('链接中未找到验证令牌。');
      return;
    }

    authApi
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err: unknown) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : '验证失败，链接可能已过期。');
      });
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        {status === 'verifying' && (
          <>
            <div className="w-12 h-12 border border-gold/40 flex items-center justify-center mx-auto animate-pulse">
              <div className="w-4 h-4 bg-gold/60" />
            </div>
            <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
              验证中…
            </h1>
            <p className="text-sm text-muted">请稍候，正在确认您的邮箱地址。</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-12 h-12 border border-success text-success flex items-center justify-center mx-auto text-xl">
              ✓
            </div>
            <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
              邮箱已验证
            </h1>
            <p className="text-sm text-muted leading-relaxed">
              您的账户已激活，现在可以登录并完成 KYC 认证。
            </p>
            <Link href="/login" className="btn-primary inline-block">
              前往登录
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-12 h-12 border border-error text-error flex items-center justify-center mx-auto text-xl">
              ✕
            </div>
            <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
              验证失败
            </h1>
            <p className="text-sm text-muted leading-relaxed">
              {message || '链接无效或已过期。'}
            </p>
            <Link href="/login" className="btn-primary inline-block">
              返回登录
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
