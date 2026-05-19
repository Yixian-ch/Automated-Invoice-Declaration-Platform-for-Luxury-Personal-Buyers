'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { kycApi } from '@/lib/api';

type Step = 'intro' | 'kyc' | 'kyb' | 'pending';

export default function OnboardingPage() {
  const { user, accessToken, isLoading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>('intro');
  const [sumsubToken, setSumsubToken] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
    if (!isLoading && user?.kycStatus === 'APPROVED') router.push('/dashboard');
    if (!isLoading && user?.kycStatus === 'PENDING') setStep('pending');
  }, [user, isLoading, router]);

  async function startKyc() {
    if (!accessToken) return;
    setError('');
    setLaunching(true);
    try {
      const res = await kycApi.startSession('kyc', accessToken);
      setSumsubToken(res.token);
      setStep('kyc');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start verification');
    } finally {
      setLaunching(false);
    }
  }

  async function startKyb() {
    if (!accessToken) return;
    setError('');
    setLaunching(true);
    try {
      const res = await kycApi.startSession('kyb', accessToken);
      setSumsubToken(res.token);
      setStep('kyb');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start verification');
    } finally {
      setLaunching(false);
    }
  }

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="w-px h-10 bg-gold animate-pulse" />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg space-y-10">

        {/* Header */}
        <div className="text-center space-y-3">
          <p className="text-xs tracking-[0.3em] uppercase text-muted">LIDP</p>
          <h1 className="text-4xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
            Identity Verification
          </h1>
          <div className="w-8 h-px bg-gold mx-auto" />
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2">
          {['intro', 'kyc', user.accountType === 'INDIVIDUAL' ? 'kyb' : null, 'pending']
            .filter(Boolean)
            .map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full transition-colors ${
                    step === s ? 'bg-gold' : 'bg-border'
                  }`}
                />
                {i < 2 && <div className="w-8 h-px bg-border" />}
              </div>
            ))}
        </div>

        {error && (
          <p className="text-xs text-error border border-error/20 bg-error/5 px-4 py-3 text-center">
            {error}
          </p>
        )}

        {/* Intro step */}
        {step === 'intro' && (
          <div className="card-luxury space-y-6">
            <div>
              <p className="text-xs tracking-widest uppercase text-muted mb-3">What we&apos;ll verify</p>
              <ul className="space-y-3 text-sm text-ink">
                <li className="flex gap-3">
                  <span className="text-gold mt-0.5">—</span>
                  <span>Your identity via passport or national ID (KYC)</span>
                </li>
                {user.accountType === 'INDIVIDUAL' && (
                  <li className="flex gap-3">
                    <span className="text-gold mt-0.5">—</span>
                    <span>Your business registration document (KYB)</span>
                  </li>
                )}
              </ul>
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted leading-relaxed">
                Your documents are processed securely by Sumsub, our KYC/KYB partner. Data is stored in the EU and retained for 5 years per French AML law (CMF Art. L561-12). You may request deletion after your relationship with LIDP ends.
              </p>
            </div>
            <button onClick={startKyc} disabled={launching} className="btn-primary w-full">
              {launching ? 'Preparing…' : 'Begin Verification'}
            </button>
          </div>
        )}

        {/* KYC step — Sumsub SDK embedded */}
        {(step === 'kyc' || step === 'kyb') && sumsubToken && (
          <div className="card-luxury space-y-6">
            <p className="text-xs tracking-widest uppercase text-muted">
              {step === 'kyc' ? 'Identity Verification' : 'Business Verification'}
            </p>
            {/* Sumsub Web SDK iframe — the SDK replaces this placeholder */}
            <div
              id="sumsub-websdk-container"
              className="min-h-[500px] flex items-center justify-center border border-border"
            >
              <div className="text-center space-y-3 p-8">
                <p className="text-sm text-muted">
                  Loading Sumsub verification widget…
                </p>
                <p className="text-xs text-muted">Token: <span className="font-mono">{sumsubToken.slice(0, 12)}…</span></p>
                <p className="text-xs text-muted mt-4">
                  In production, the Sumsub Web SDK script is loaded here and mounts into{' '}
                  <code className="font-mono">#sumsub-websdk-container</code>.
                </p>
              </div>
            </div>
            {step === 'kyc' && user.accountType === 'INDIVIDUAL' && (
              <button onClick={startKyb} disabled={launching} className="btn-primary w-full">
                {launching ? 'Preparing…' : 'Continue to Business Verification'}
              </button>
            )}
            {(step === 'kyb' || user.accountType !== 'INDIVIDUAL') && (
              <button onClick={() => setStep('pending')} className="btn-primary w-full">
                I&apos;ve completed verification
              </button>
            )}
          </div>
        )}

        {/* Pending step */}
        {step === 'pending' && (
          <div className="card-luxury text-center space-y-6">
            <div className="w-12 h-12 border border-gold text-gold flex items-center justify-center mx-auto text-xl">
              ✓
            </div>
            <div className="space-y-2">
              <p className="text-lg font-light" style={{ fontFamily: 'var(--font-serif)' }}>
                Verification In Progress
              </p>
              <p className="text-sm text-muted leading-relaxed">
                Your documents are being reviewed. This typically takes 1–2 business days. You will receive an email when your account is approved.
              </p>
            </div>
            <button onClick={() => router.push('/dashboard')} className="btn-ghost text-sm">
              Return to dashboard
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
