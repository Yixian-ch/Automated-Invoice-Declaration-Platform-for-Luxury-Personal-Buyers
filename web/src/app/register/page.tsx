'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authApi } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
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

    setLoading(true);
    try {
      await authApi.register({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone || undefined,
        locale: form.locale,
      });

      await login(form.email, form.password);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <p className="text-xs tracking-[0.3em] uppercase text-stone-400">LIDP</p>
          <p className="text-xs tracking-[0.15em] uppercase text-[#B8966E] mt-1">
            Luxury Invoice Declaration Platform
          </p>
        </div>

        <div className="bg-white border border-stone-200 p-8">
          <h1
            className="text-2xl font-light text-stone-800 mb-6"
            style={{ fontFamily: 'Cormorant Garamond, serif' }}
          >
            创建账户
          </h1>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-stone-500 mb-1">姓</label>
                <input
                  type="text"
                  required
                  value={form.lastName}
                  onChange={(e) => set('lastName', e.target.value)}
                  className="w-full border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:border-[#B8966E]"
                  placeholder="张"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">名</label>
                <input
                  type="text"
                  required
                  value={form.firstName}
                  onChange={(e) => set('firstName', e.target.value)}
                  className="w-full border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:border-[#B8966E]"
                  placeholder="三"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-stone-500 mb-1">邮箱</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className="w-full border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:border-[#B8966E]"
                placeholder="example@email.com"
              />
            </div>

            <div>
              <label className="block text-xs text-stone-500 mb-1">手机号（选填）</label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                className="w-full border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:border-[#B8966E]"
                placeholder="+86 138 0000 0000"
              />
            </div>

            <div>
              <label className="block text-xs text-stone-500 mb-1">密码</label>
              <input
                type="password"
                required
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                className="w-full border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:border-[#B8966E]"
                placeholder="至少 8 个字符"
              />
            </div>

            <div>
              <label className="block text-xs text-stone-500 mb-1">确认密码</label>
              <input
                type="password"
                required
                value={form.confirmPassword}
                onChange={(e) => set('confirmPassword', e.target.value)}
                className="w-full border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:border-[#B8966E]"
                placeholder="再次输入密码"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 text-white text-sm tracking-widest uppercase disabled:opacity-50"
              style={{ backgroundColor: '#B8966E' }}
            >
              {loading ? '注册中…' : '注册'}
            </button>
          </form>

          <p className="text-center text-xs text-stone-400 mt-6">
            已有账户？{' '}
            <Link href="/login" className="text-[#B8966E] hover:underline">
              登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
