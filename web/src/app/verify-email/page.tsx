'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';

type Status = 'verifying' | 'success' | 'error';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('verifying');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token found in the link.');
      return;
    }

    authApi
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err: unknown) => {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Verification failed. The link may have expired.');
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
              Verifying…
            </h1>
            <p className="text-sm text-muted">Please wait while we confirm your email address.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-12 h-12 border border-success text-success flex items-center justify-center mx-auto text-xl">
              ✓
            </div>
            <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
              Email Verified
            </h1>
            <p className="text-sm text-muted leading-relaxed">
              Your account is now active. You may sign in and complete your KYC verification.
            </p>
            <Link href="/login" className="btn-primary inline-block">
              Sign In
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-12 h-12 border border-error text-error flex items-center justify-center mx-auto text-xl">
              ✕
            </div>
            <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
              Verification Failed
            </h1>
            <p className="text-sm text-muted leading-relaxed">
              {message || 'The link is invalid or has expired.'}
            </p>
            <Link href="/login" className="btn-primary inline-block">
              Back to Sign In
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
