'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type RegistrationPath = 'choose' | 'self' | 'invite';
type Step = RegistrationPath | 'success';

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [step, setStep] = useState<Step>('choose');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
    locale: 'zh',
    accountType: 'INDIVIDUAL' as 'INDIVIDUAL' | 'ORGANIZATION',
    companyName: '',
    companyRegistrationNo: '',
    inviteCode: '',
  });

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('两次密码不一致');
      return;
    }
    if (form.password.length < 8) {
      setError('密码至少需要 8 个字符');
      return;
    }
    if (step === 'self' && form.accountType === 'ORGANIZATION' && !form.companyName.trim()) {
      setError('请填写公司名称');
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
      try {
        await login(form.email, form.password);
        router.push('/dashboard');
        return;
      } catch {
        // 邮箱验证未跳过时落到成功页
      }
      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
    } finally {
      setLoading(false);
    }
  }

  // ─── 注册成功 ────────────────────────────────────────────────────────────────
  if (step === 'success') {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="text-center space-y-6 max-w-md">
          <div className="w-12 h-12 border border-success text-success flex items-center justify-center mx-auto text-xl">
            ✓
          </div>
          <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
            注册申请已收到
          </h1>
          <p className="text-sm text-muted leading-relaxed">
            请查收验证邮件，邮箱验证后方可登录。
          </p>
          <Link href="/login" className="btn-primary inline-block">
            前往登录
          </Link>
        </div>
      </main>
    );
  }

  // ─── 选择注册方式 ──────────────────────────────────────────────────────────────
  if (step === 'choose') {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-16">
        <div className="w-full max-w-lg space-y-10">
          <div className="text-center space-y-3">
            <Link href="/" className="text-xs tracking-[0.3em] uppercase text-muted hover:text-ink transition-colors">
              LIDP
            </Link>
            <h1 className="text-4xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
              创建账户
            </h1>
            <div className="w-8 h-px bg-gold mx-auto" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* 自助注册 */}
            <button
              onClick={() => setStep('self')}
              className="card-luxury text-left space-y-3 hover:border-gold transition-colors group p-6"
            >
              <div className="w-8 h-8 border border-gold/50 flex items-center justify-center text-gold group-hover:bg-gold group-hover:text-white transition-colors text-sm">
                ✦
              </div>
              <div>
                <p className="text-sm font-medium tracking-wide">我是新买手</p>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  注册个人或企业账户，提交资料完成 KYC / KYB 审核。
                </p>
              </div>
            </button>

            {/* 邀请码注册 */}
            <button
              onClick={() => setStep('invite')}
              className="card-luxury text-left space-y-3 hover:border-gold transition-colors group p-6"
            >
              <div className="w-8 h-8 border border-gold/50 flex items-center justify-center text-gold group-hover:bg-gold group-hover:text-white transition-colors text-sm">
                ⬡
              </div>
              <div>
                <p className="text-sm font-medium tracking-wide">我有邀请码</p>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  您的公司管理员已共享邀请码，立即加入团队。
                </p>
              </div>
            </button>
          </div>

          <p className="text-center text-sm text-muted">
            已有账户？{' '}
            <Link href="/login" className="text-ink underline underline-offset-4 hover:text-gold transition-colors">
              登录
            </Link>
          </p>
        </div>
      </main>
    );
  }

  // ─── 公共表单字段 ──────────────────────────────────────────────────────────────
  const commonFields = (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs tracking-widest uppercase text-muted" htmlFor="firstName">
            名
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
            姓
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
          邮箱
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
          电话 <span className="normal-case text-muted">（选填）</span>
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
          密码
        </label>
        <input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={(e) => set('password', e.target.value)}
          className="input-luxury"
          placeholder="至少 8 个字符"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs tracking-widest uppercase text-muted" htmlFor="confirm">
          确认密码
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
          偏好语言
        </label>
        <select
          id="locale"
          value={form.locale}
          onChange={(e) => set('locale', e.target.value)}
          className="input-luxury"
        >
          <option value="zh">中文</option>
          <option value="fr">Français</option>
          <option value="en">English</option>
        </select>
      </div>
    </>
  );

  // ─── 自助注册表单 ──────────────────────────────────────────────────────────────
  if (step === 'self') {
    return (
      <main className="flex min-h-screen items-center justify-center px-4 py-16">
        <div className="w-full max-w-md space-y-10">
          <div className="text-center space-y-3">
            <Link href="/" className="text-xs tracking-[0.3em] uppercase text-muted hover:text-ink transition-colors">
              LIDP
            </Link>
            <h1 className="text-4xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
              新买手注册
            </h1>
            <div className="w-8 h-px bg-gold mx-auto" />
          </div>

          <form onSubmit={handleSubmit} className="card-luxury space-y-5">
            {error && (
              <p className="text-xs text-error border border-error/20 bg-error/5 px-4 py-3">{error}</p>
            )}

            {/* 账户类型 */}
            <div className="space-y-2">
              <p className="text-xs tracking-widest uppercase text-muted">账户类型</p>
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
                    {type === 'INDIVIDUAL' ? '个人' : '企业'}
                  </button>
                ))}
              </div>
            </div>

            {/* 企业字段 */}
            {form.accountType === 'ORGANIZATION' && (
              <>
                <div className="space-y-1">
                  <label className="text-xs tracking-widest uppercase text-muted" htmlFor="companyName">
                    公司名称
                  </label>
                  <input
                    id="companyName"
                    type="text"
                    required
                    value={form.companyName}
                    onChange={(e) => set('companyName', e.target.value)}
                    className="input-luxury"
                    placeholder="如：SARL Mon Entreprise"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs tracking-widest uppercase text-muted" htmlFor="regNo">
                    工商注册号{' '}
                    <span className="normal-case text-muted">（SIRET / RCS，选填）</span>
                  </label>
                  <input
                    id="regNo"
                    type="text"
                    value={form.companyRegistrationNo}
                    onChange={(e) => set('companyRegistrationNo', e.target.value)}
                    className="input-luxury font-mono"
                    placeholder="如：123 456 789 00010"
                  />
                </div>
              </>
            )}

            <div className="w-full h-px bg-border" />

            {commonFields}

            <p className="text-xs text-muted leading-relaxed">
              注册即表示您同意我们依据{' '}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
                隐私政策
              </Link>{' '}
              及 GDPR 处理您的个人数据。身份文件将通过 Sumsub 进行 KYC
              {form.accountType === 'ORGANIZATION' ? '/KYB' : ''} 认证，依据法国反洗钱法（CMF 第 L561-12 条）保留 5 年。
            </p>

            <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
              {loading ? '创建中…' : '创建账户'}
            </button>
          </form>

          <p className="text-center text-sm text-muted">
            <button onClick={() => setStep('choose')} className="underline underline-offset-4 hover:text-gold transition-colors">
              ← 返回
            </button>
            {' · '}
            <Link href="/login" className="text-ink underline underline-offset-4 hover:text-gold transition-colors">
              登录
            </Link>
          </p>
        </div>
      </main>
    );
  }

  // ─── 邀请码注册表单 ────────────────────────────────────────────────────────────
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-16">
      <div className="w-full max-w-md space-y-10">
        <div className="text-center space-y-3">
          <Link href="/" className="text-xs tracking-[0.3em] uppercase text-muted hover:text-ink transition-colors">
            LIDP
          </Link>
          <h1 className="text-4xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
            加入团队
          </h1>
          <div className="w-8 h-px bg-gold mx-auto" />
        </div>

        <form onSubmit={handleSubmit} className="card-luxury space-y-5">
          {error && (
            <p className="text-xs text-error border border-error/20 bg-error/5 px-4 py-3">{error}</p>
          )}

          <div className="space-y-1">
            <label className="text-xs tracking-widest uppercase text-muted" htmlFor="invite">
              邀请码
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
            注册即表示您同意我们依据{' '}
            <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
              隐私政策
            </Link>{' '}
            及 GDPR 处理您的个人数据。身份文件将通过 Sumsub 进行 KYC 认证，依据法国反洗钱法（CMF 第 L561-12 条）保留 5 年。
          </p>

          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? '加入中…' : '加入团队'}
          </button>
        </form>

        <p className="text-center text-sm text-muted">
          <button onClick={() => setStep('choose')} className="underline underline-offset-4 hover:text-gold transition-colors">
            ← 返回
          </button>
          {' · '}
          <Link href="/login" className="text-ink underline underline-offset-4 hover:text-gold transition-colors">
            登录
          </Link>
        </p>
      </div>
    </main>
  );
}
