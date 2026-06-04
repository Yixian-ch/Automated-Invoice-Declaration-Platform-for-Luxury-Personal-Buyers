'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { kycApi } from '@/lib/api';

type Step = 'intro' | 'kyc' | 'kyb' | 'pending';

export default function OnboardingPage() {
  const { user, accessToken, isLoading, refreshUser } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>('intro');
  const [verifyUrl, setVerifyUrl] = useState<string | null>(null);
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
      // Request a presigned upload URL for the passport photo
      const fileName = 'passport.jpg';
      const mimeType = 'image/jpeg';
      const res = await kycApi.startSession('kyc', fileName, mimeType, accessToken);
      // Upload directly to presigned URL
      await fetch(res.presignedUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: new Blob() });
      // Confirm upload (mark as pending review)
      await kycApi.confirm(res.s3Key, accessToken);
      setStep('pending');
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
      // Request a presigned upload URL for the business document
      const fileName = 'business.pdf';
      const mimeType = 'application/pdf';
      const res = await kycApi.startSession('kyb', fileName, mimeType, accessToken);
      // Upload directly to presigned URL (placeholder blob)
      await fetch(res.presignedUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: new Blob() });
      // Confirm upload (mark as pending review)
      await kycApi.confirm(res.s3Key, accessToken);
      setStep('pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start business verification');
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
      <div className="w-full max-w-2xl space-y-10">

        {/* Header */}
        <div className="text-center space-y-3">
          <p className="text-xs tracking-[0.3em] uppercase text-muted">LIDP</p>
          <h1 className="text-4xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
            Identity Verification
          </h1>
          <div className="w-8 h-px bg-gold mx-auto" />
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
                {!user.registeredViaInvite && (
                  <li className="flex gap-3">
                    <span className="text-gold mt-0.5">—</span>
                    <span>Your business registration document (KYB)</span>
                  </li>
                )}
              </ul>
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted leading-relaxed">
                Your documents are processed securely by Didit, our KYC/KYB partner. Data is stored in the EU and retained for 5 years per French AML law (CMF Art. L561-12). You may request deletion after your relationship with LIDP ends.
              </p>
            </div>
            <button onClick={startKyc} disabled={launching} className="btn-primary w-full">
              {launching ? 'Preparing…' : 'Begin Verification'}
            </button>
          </div>
        )}

        {/* KYC / KYB step — Didit hosted iframe */}
        {(step === 'kyc' || step === 'kyb') && verifyUrl && (
          <div className="card-luxury space-y-4">
            <p className="text-xs tracking-widest uppercase text-muted">
              {step === 'kyc' ? 'Identity Verification' : 'Business Verification'}
            </p>

            {/* Dev bypass mode */}
            {verifyUrl === '__bypass__' ? (
              <div className="border border-dashed border-gold/40 bg-gold/5 p-6 text-center space-y-3">
                <p className="text-xs tracking-widest uppercase text-gold">Dev Mode — KYC Bypassed</p>
                <p className="text-sm text-muted">
                  {step === 'kyc' ? 'KYC' : 'KYB'} auto-approved. Set <code className="text-xs bg-surface px-1 py-0.5">BYPASS_KYC=false</code> to use real Didit verification.
                </p>
                <button
                  onClick={async () => {
                    if (step === 'kyc' && !user.registeredViaInvite) {
                      startKyb();
                    } else {
                      await refreshUser();
                      router.push('/dashboard');
                    }
                  }}
                  className="btn-primary text-sm"
                >
                  {step === 'kyc' && !user.registeredViaInvite ? 'Continue to Business Verification →' : 'Continue →'}
                </button>
              </div>
            ) : (
              <>
                <iframe
                  src={verifyUrl}
                  allow="camera; microphone; fullscreen; autoplay; encrypted-media"
                  className="w-full border-0"
                  style={{ height: '620px', minHeight: '500px' }}
                  title={step === 'kyc' ? 'Identity Verification' : 'Business Verification'}
                />
                {/* After KYC, self-registered users (no invite) must also do KYB */}
                {step === 'kyc' && !user.registeredViaInvite && (
                  <button onClick={startKyb} disabled={launching} className="btn-primary w-full">
                    {launching ? 'Preparing…' : 'Continue to Business Verification'}
                  </button>
                )}
                <button onClick={() => setStep('pending')} className="btn-ghost w-full text-sm">
                  I&apos;ve completed verification — check back later
                </button>
              </>
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
            <button onClick={async () => { await refreshUser(); router.push('/dashboard'); }} className="btn-ghost text-sm">
              Return to dashboard
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
