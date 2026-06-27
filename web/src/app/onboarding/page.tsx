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
      const fileName = 'passport.jpg';
      const mimeType = 'image/jpeg';
      const res = await kycApi.startSession('kyc', fileName, mimeType, accessToken);
      await fetch(res.presignedUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: new Blob() });
      await kycApi.confirm(res.s3Key, accessToken);
      setStep('pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动认证失败');
    } finally {
      setLaunching(false);
    }
  }

  async function startKyb() {
    if (!accessToken) return;
    setError('');
    setLaunching(true);
    try {
      const fileName = 'business.pdf';
      const mimeType = 'application/pdf';
      const res = await kycApi.startSession('kyb', fileName, mimeType, accessToken);
      await fetch(res.presignedUrl, { method: 'PUT', headers: { 'Content-Type': mimeType }, body: new Blob() });
      await kycApi.confirm(res.s3Key, accessToken);
      setStep('pending');
    } catch (err) {
      setError(err instanceof Error ? err.message : '启动企业认证失败');
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

        {/* 头部 */}
        <div className="text-center space-y-3">
          <p className="text-xs tracking-[0.3em] uppercase text-muted">LIDP</p>
          <h1 className="text-4xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
            身份认证
          </h1>
          <div className="w-8 h-px bg-gold mx-auto" />
        </div>

        {error && (
          <p className="text-xs text-error border border-error/20 bg-error/5 px-4 py-3 text-center">
            {error}
          </p>
        )}

        {/* 介绍步骤 */}
        {step === 'intro' && (
          <div className="card-luxury space-y-6">
            <div>
              <p className="text-xs tracking-widest uppercase text-muted mb-3">需验证的内容</p>
              <ul className="space-y-3 text-sm text-ink">
                <li className="flex gap-3">
                  <span className="text-gold mt-0.5">—</span>
                  <span>您的身份证明文件（护照或身份证）—— KYC</span>
                </li>
                {!user.registeredViaInvite && (
                  <li className="flex gap-3">
                    <span className="text-gold mt-0.5">—</span>
                    <span>您的企业注册文件 —— KYB</span>
                  </li>
                )}
              </ul>
            </div>
            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted leading-relaxed">
                您的文件将由我们的 KYC/KYB 合作方 Didit 安全处理，数据存储于欧盟境内，依据法国反洗钱法（CMF 第 L561-12 条）保留 5 年。终止与 LIDP 的合作关系后，您可申请删除数据。
              </p>
            </div>
            <button onClick={startKyc} disabled={launching} className="btn-primary w-full">
              {launching ? '准备中…' : '开始认证'}
            </button>
          </div>
        )}

        {/* KYC / KYB 步骤 */}
        {(step === 'kyc' || step === 'kyb') && verifyUrl && (
          <div className="card-luxury space-y-4">
            <p className="text-xs tracking-widest uppercase text-muted">
              {step === 'kyc' ? '身份认证' : '企业认证'}
            </p>

            {verifyUrl === '__bypass__' ? (
              <div className="border border-dashed border-gold/40 bg-gold/5 p-6 text-center space-y-3">
                <p className="text-xs tracking-widest uppercase text-gold">开发模式 — KYC 已跳过</p>
                <p className="text-sm text-muted">
                  {step === 'kyc' ? 'KYC' : 'KYB'} 已自动通过。设置 <code className="text-xs bg-surface px-1 py-0.5">BYPASS_KYC=false</code> 以启用真实认证。
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
                  {step === 'kyc' && !user.registeredViaInvite ? '继续企业认证 →' : '继续 →'}
                </button>
              </div>
            ) : (
              <>
                <iframe
                  src={verifyUrl}
                  allow="camera; microphone; fullscreen; autoplay; encrypted-media"
                  className="w-full border-0"
                  style={{ height: '620px', minHeight: '500px' }}
                  title={step === 'kyc' ? '身份认证' : '企业认证'}
                />
                {step === 'kyc' && !user.registeredViaInvite && (
                  <button onClick={startKyb} disabled={launching} className="btn-primary w-full">
                    {launching ? '准备中…' : '继续企业认证'}
                  </button>
                )}
                <button onClick={() => setStep('pending')} className="btn-ghost w-full text-sm">
                  我已完成认证，稍后查看结果
                </button>
              </>
            )}
          </div>
        )}

        {/* 等待审核步骤 */}
        {step === 'pending' && (
          <div className="card-luxury text-center space-y-6">
            <div className="w-12 h-12 border border-gold text-gold flex items-center justify-center mx-auto text-xl">
              ✓
            </div>
            <div className="space-y-2">
              <p className="text-lg font-light" style={{ fontFamily: 'var(--font-serif)' }}>
                认证审核中
              </p>
              <p className="text-sm text-muted leading-relaxed">
                您的文件正在审核中，通常需要 1-2 个工作日。账户通过后您将收到邮件通知。
              </p>
            </div>
            <button onClick={async () => { await refreshUser(); router.push('/dashboard'); }} className="btn-ghost text-sm">
              返回工作台
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
