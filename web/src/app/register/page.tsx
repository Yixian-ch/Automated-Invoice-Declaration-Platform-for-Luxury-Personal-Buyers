'use client';

import { useState } from 'react';
import Link from 'next/link';
import { authApi } from '@/lib/api';

type RegistrationPath = 'choose' | 'self' | 'invite';
type Step = RegistrationPath | 'success';

export default function RegisterPage() {
  const [step, setStep] = useState<Step>('choose');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    // Common fields
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
    locale: 'fr',
    // Path A — self-registration
    accountType: 'INDIVIDUAL' as 'INDIVIDUAL' | 'ORGANIZATION',
    companyName: '',
    companyRegistrationNo: '',
    // Path B — invite
    inviteCode: '',
  });

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (step === 'self' && form.accountType === 'ORGANIZATION' && !form.companyName.trim()) {
      setError('Company name is required');
      return;
    }

    setLoading(true);
    try {
      const payload =
        step === 'invite'
          ? {
              email: form.email,
              password: form.password,
              firstName: form.firstName,
              lastName: form.lastName,
              phone: form.phone || undefined,
              locale: form.locale,
              inviteCode: form.inviteCode.trim(),
            }
          : {
              email: form.email,
              password: form.password,
              firstName: form.firstName,
              lastName: form.lastName,
              phone: form.phone || undefined,
              locale: form.locale,
              accountType: form.accountType,
              companyName: form.accountType === 'ORGANIZATION' ? form.companyName.trim() : undefined,
              companyRegistrationNo:
                form.accountType === 'ORGANIZATION' && form.companyRegistrationNo.trim()
                  ? form.companyRegistrationNo.trim()
                  : undefined,
            };

      await authApi.register(payload);
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  // ─── Success ─────────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-12 h-12 border border-success text-success flex items-center justify-center mx-auto text-xl">
            ✓
          </div>
          <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
            Registration Received
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            Please check your email to verify your account before signing in.
          </p>
          <Link href="/login" className="btn-primary inline-block">
            Go to Sign In
          </Link>
        </div>
      </main>
    );
  }

  // ─── Choose path ─────────────────────────────────────────────────────────────
  if (step === 'choose') {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg space-y-10">
          <div className="text-center space-y-3">
            <Link href="/" className="text-xs tracking-[0.3em] uppercase text-muted hover:text-ink transition-colors">
              LIDP
            </Link>
            <h1 className="text-4xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
              Create Account
            </h1>
            <div className="w-8 h-px bg-gold mx-auto" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Path A */}
            <button
              onClick={() => setStep('self')}
              className="card-luxury text-left space-y-3 hover:border-gold transition-colors group p-6"
            >
              <div className="w-8 h-8 border border-gold/50 flex items-center justify-center text-gold group-hover:bg-gold group-hover:text-white transition-colors text-sm">
                ✦
              </div>
              <div>
                <p className="text-sm font-medium tracking-wide">{"I'm a new reseller"}</p>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Register your individual or company account. Submit documents for KYC&thinsp;/&thinsp;KYB approval.
                </p>
              </div>
            </button>

            {/* Path B */}
            <button
              onClick={() => setStep('invite')}
              className="card-luxury text-left space-y-3 hover:border-gold transition-colors group p-6"
            >
              <div className="w-8 h-8 border border-gold/50 flex items-center justify-center text-gold group-hover:bg-gold group-hover:text-white transition-colors text-sm">
                ⬡
              </div>
              <div>
                <p className="text-sm font-medium tracking-wide">I have an invite code</p>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Your company admin shared a code with you. Join your organisation now.
                </p>
              </div>
            </button>
          </div>

          <p className="text-center text-sm text-muted">
            Already have an account?{' '}
            <Link href="/login" className="text-ink underline underline-offset-4 hover:text-gold transition-colors">
              Sign In
            </Link>
          </p>
        </div>
      </main>
    );
  }

  // ─── Shared form fields ───────────────────────────────────────────────────────
  const commonFields = (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs tracking-widest uppercase text-muted" htmlFor="firstName">
            First Name
          </label>
          <input
            id="firstName"
            type="text"
            required
            value={form.firstName}
            onChange={(e) => set('firstName', e.target.value)}
            className="input-luxury"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs tracking-widest uppercase text-muted" htmlFor="lastName">
            Last Name
          </label>
          <input
            id="lastName"
            type="text"
            required
            value={form.lastName}
            onChange={(e) => set('lastName', e.target.value)}
            className="input-luxury"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs tracking-widest uppercase text-muted" htmlFor="reg-email">
          Email
        </label>
        <input
          id="reg-email"
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => set('email', e.target.value)}
          className="input-luxury"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs tracking-widest uppercase text-muted" htmlFor="phone">
          Phone <span className="normal-case text-muted">(optional)</span>
        </label>
        <input
          id="phone"
          type="tel"
          value={form.phone}
          onChange={(e) => set('phone', e.target.value)}
          className="input-luxury"
          placeholder="+33 6 00 00 00 00"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs tracking-widest uppercase text-muted" htmlFor="reg-password">
          Password
        </label>
        <input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={(e) => set('password', e.target.value)}
          className="input-luxury"
          placeholder="Min. 8 characters"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs tracking-widest uppercase text-muted" htmlFor="confirm">
          Confirm Password
        </label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={form.confirmPassword}
          onChange={(e) => set('confirmPassword', e.target.value)}
          className="input-luxury"
          placeholder="••••••••"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs tracking-widest uppercase text-muted" htmlFor="locale">
          Preferred Language
        </label>
        <select
          id="locale"
          value={form.locale}
          onChange={(e) => set('locale', e.target.value)}
          className="input-luxury"
        >
          <option value="fr">Français</option>
          <option value="en">English</option>
          <option value="zh">中文</option>
        </select>
      </div>
    </>
  );

  // ─── Path A — Self-registration form ─────────────────────────────────────────
  if (step === 'self') {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-16">
        <div className="w-full max-w-md space-y-10">
          <div className="text-center space-y-3">
            <Link href="/" className="text-xs tracking-[0.3em] uppercase text-muted hover:text-ink transition-colors">
              LIDP
            </Link>
            <h1 className="text-4xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
              New Reseller Account
            </h1>
            <div className="w-8 h-px bg-gold mx-auto" />
          </div>

          <form onSubmit={handleSubmit} className="card-luxury space-y-5">
            {error && (
              <p className="text-xs text-error border border-error/20 bg-error/5 px-4 py-3">{error}</p>
            )}

            {/* Account type selector */}
            <div className="space-y-2">
              <p className="text-xs tracking-widest uppercase text-muted">Account Type</p>
              <div className="grid grid-cols-2 gap-3">
                {(['INDIVIDUAL', 'ORGANIZATION'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => set('accountType', type)}
                    className={`py-2.5 px-4 text-xs tracking-wider border transition-colors ${
                      form.accountType === type
                        ? 'border-gold bg-gold/5 text-ink'
                        : 'border-border text-muted hover:border-ink'
                    }`}
                  >
                    {type === 'INDIVIDUAL' ? 'Individual' : 'Company'}
                  </button>
                ))}
              </div>
            </div>

            {/* Company fields */}
            {form.accountType === 'ORGANIZATION' && (
              <>
                <div className="space-y-1">
                  <label className="text-xs tracking-widest uppercase text-muted" htmlFor="companyName">
                    Company Name
                  </label>
                  <input
                    id="companyName"
                    type="text"
                    required
                    value={form.companyName}
                    onChange={(e) => set('companyName', e.target.value)}
                    className="input-luxury"
                    placeholder="e.g. SARL Mon Entreprise"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs tracking-widest uppercase text-muted" htmlFor="regNo">
                    Registration No.{' '}
                    <span className="normal-case text-muted">(SIRET / RCS, optional)</span>
                  </label>
                  <input
                    id="regNo"
                    type="text"
                    value={form.companyRegistrationNo}
                    onChange={(e) => set('companyRegistrationNo', e.target.value)}
                    className="input-luxury font-mono"
                    placeholder="e.g. 123 456 789 00010"
                  />
                </div>
              </>
            )}

            <div className="w-full h-px bg-border" />

            {commonFields}

            <p className="text-xs text-muted leading-relaxed">
              By registering, you consent to the processing of your personal data in accordance with our{' '}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
                Privacy Policy
              </Link>{' '}
              and GDPR. Identity documents are processed via Sumsub for KYC
              {form.accountType === 'ORGANIZATION' ? '/KYB' : ''} and retained for 5 years per French AML law (CMF Art.&nbsp;L561-12).
            </p>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm text-muted">
            <button onClick={() => setStep('choose')} className="underline underline-offset-4 hover:text-gold transition-colors">
              ← Back
            </button>
            {' · '}
            <Link href="/login" className="text-ink underline underline-offset-4 hover:text-gold transition-colors">
              Sign In
            </Link>
          </p>
        </div>
      </main>
    );
  }

  // ─── Path B — Invite-code form ────────────────────────────────────────────────
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-10">
        <div className="text-center space-y-3">
          <Link href="/" className="text-xs tracking-[0.3em] uppercase text-muted hover:text-ink transition-colors">
            LIDP
          </Link>
          <h1 className="text-4xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
            Join Your Organisation
          </h1>
          <div className="w-8 h-px bg-gold mx-auto" />
        </div>

        <form onSubmit={handleSubmit} className="card-luxury space-y-5">
          {error && (
            <p className="text-xs text-error border border-error/20 bg-error/5 px-4 py-3">{error}</p>
          )}

          <div className="space-y-1">
            <label className="text-xs tracking-widest uppercase text-muted" htmlFor="invite">
              Invite Code
            </label>
            <input
              id="invite"
              type="text"
              required
              value={form.inviteCode}
              onChange={(e) => set('inviteCode', e.target.value)}
              className="input-luxury font-mono tracking-wider"
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            />
          </div>

          <div className="w-full h-px bg-border" />

          {commonFields}

          <p className="text-xs text-muted leading-relaxed">
            By registering, you consent to the processing of your personal data in accordance with our{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
              Privacy Policy
            </Link>{' '}
            and GDPR. Identity documents are processed via Sumsub for KYC and retained for 5 years per French AML law (CMF Art.&nbsp;L561-12).
          </p>

          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? 'Joining…' : 'Join Organisation'}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          <button onClick={() => setStep('choose')} className="underline underline-offset-4 hover:text-gold transition-colors">
            ← Back
          </button>
          {' · '}
          <Link href="/login" className="text-ink underline underline-offset-4 hover:text-gold transition-colors">
            Sign In
          </Link>
        </p>
      </div>
    </main>
  );
}
