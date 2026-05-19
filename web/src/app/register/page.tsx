'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';

type Step = 'details' | 'success';

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('details');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    inviteCode: '',
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
    locale: 'fr',
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

    setLoading(true);
    try {
      await authApi.register({
        inviteCode: form.inviteCode.trim(),
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || undefined,
        locale: form.locale,
      });
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

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

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-10">

        {/* Header */}
        <div className="text-center space-y-3">
          <Link href="/" className="text-xs tracking-[0.3em] uppercase text-muted hover:text-ink transition-colors">
            LIDP
          </Link>
          <h1 className="text-4xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
            Create Account
          </h1>
          <div className="w-8 h-px bg-gold mx-auto" />
          <p className="text-xs text-muted">An invite code is required to register.</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card-luxury space-y-5">
          {error && (
            <p className="text-xs text-error border border-error/20 bg-error/5 px-4 py-3">
              {error}
            </p>
          )}

          {/* Invite code — first, most prominent */}
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

          {/* Name row */}
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

          {/* GDPR consent */}
          <p className="text-xs text-muted leading-relaxed">
            By registering, you consent to the processing of your personal data in accordance with our{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
              Privacy Policy
            </Link>{' '}
            and GDPR. Your identity documents will be processed via Sumsub for KYC/KYB verification and retained for 5 years per French AML law (CMF Art. L561-12).
          </p>

          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

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
