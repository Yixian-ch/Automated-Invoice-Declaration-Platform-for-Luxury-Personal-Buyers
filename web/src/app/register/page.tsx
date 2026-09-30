'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { authApi, userApi, type Gender, type ProfileDocumentType } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  GENDER_OPTIONS,
  PASSWORD_PATTERN,
  PASSWORD_RULE,
  PROFILE_DOCUMENTS,
  checkDocumentFile,
  isValidPhone,
  normalizePhone,
} from '@/lib/profile-fields';

const INPUT_CLASS =
  'w-full border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:border-[#B8966E]';

type TextField =
  | 'lastName'
  | 'firstName'
  | 'email'
  | 'phone'
  | 'nationality'
  | 'residenceCountry'
  | 'taxResidenceCountry'
  | 'password'
  | 'confirmPassword';

function FieldLabel({ no, label, required }: { no: number; label: string; required?: boolean }) {
  return (
    <label className="block text-xs text-stone-500 mb-1">
      <span className="text-stone-400 mr-1.5">{String(no).padStart(2, '0')}</span>
      {required && <span className="text-red-500 mr-0.5">*</span>}
      {label}
    </label>
  );
}

function FilePicker({
  file,
  onChange,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(f: File | undefined) {
    if (!f) return;
    const problem = checkDocumentFile(f);
    if (problem) {
      toast.error(problem);
      return;
    }
    onChange(f);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files?.[0]);
      }}
      className={`border border-dashed px-3 py-4 text-center text-xs cursor-pointer ${
        dragging ? 'border-[#B8966E] bg-[#FAF9F7]' : 'border-stone-300'
      }`}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {file ? (
        <span className="text-stone-700">
          {file.name}
          <button
            type="button"
            className="ml-2 text-[#B8966E] hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
          >
            移除
          </button>
        </span>
      ) : (
        <span className="text-stone-400">
          点击上传或拖拽图片/文件至此处 · PDF / JPEG / PNG,单个不超过 10 MB
        </span>
      )}
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<Record<TextField, string>>({
    lastName: '',
    firstName: '',
    email: '',
    phone: '',
    nationality: '',
    residenceCountry: '',
    taxResidenceCountry: '',
    password: '',
    confirmPassword: '',
  });
  const [gender, setGender] = useState<Gender | ''>('');
  const [files, setFiles] = useState<Partial<Record<ProfileDocumentType, File>>>({});

  function set(field: TextField, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setFile(type: ProfileDocumentType, file: File | null) {
    setFiles((prev) => {
      const next = { ...prev };
      if (file) next[type] = file;
      else delete next[type];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!gender) return setError('请选择性别');
    if (!isValidPhone(form.phone)) {
      return setError('请填写带国家号的手机号码,如 +8613366666666 或 008613366666666');
    }
    if (!PASSWORD_PATTERN.test(form.password)) return setError(PASSWORD_RULE);
    if (form.password !== form.confirmPassword) return setError('两次密码不一致');
    const passport = files.passport;
    if (!passport) return setError('请上传有效护照首页');

    setLoading(true);
    try {
      await authApi.register({
        lastName: form.lastName.trim(),
        firstName: form.firstName.trim(),
        gender,
        email: form.email.trim(),
        phone: normalizePhone(form.phone),
        nationality: form.nationality.trim(),
        residenceCountry: form.residenceCountry.trim(),
        taxResidenceCountry: form.taxResidenceCountry.trim(),
        password: form.password,
        locale: 'zh',
        passport,
      });

      const { accessToken: token } = await login(form.email.trim(), form.password);

      // 选填材料在账户建好后逐个上传(每个请求都在 nginx 单请求限制内);
      // 失败的不阻断注册,提示用户去「我的主页」补传
      const optional = PROFILE_DOCUMENTS.filter((d) => d.type !== 'passport' && files[d.type]);
      const failed: string[] = [];
      for (const d of optional) {
        try {
          await userApi.uploadDocument(token, d.type, files[d.type]!);
        } catch {
          failed.push(d.title.split(' / ')[0]);
        }
      }
      if (failed.length) {
        toast.error(`注册成功,但以下材料上传失败,请在「我的主页」补传:${failed.join('、')}`);
      }
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  const textInput = (field: TextField, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      type="text"
      required
      value={form[field]}
      onChange={(e) => set(field, e.target.value)}
      className={INPUT_CLASS}
      placeholder="请输入"
      {...props}
    />
  );

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="text-center mb-10">
          <p className="text-xs tracking-[0.3em] uppercase text-stone-400">LIDP</p>
          <p className="text-xs tracking-[0.15em] uppercase text-[#B8966E] mt-1">
            Luxury Invoice Declaration Platform
          </p>
        </div>

        <div className="bg-white border border-stone-200 p-6 sm:p-8">
          <h1
            className="text-2xl font-light text-stone-800 mb-3"
            style={{ fontFamily: 'Cormorant Garamond, serif' }}
          >
            创建账户
          </h1>
          <p className="text-xs leading-relaxed text-stone-500 mb-6">
            建议用英语字母或者拼音填写以下问卷。上传材料部分请至少提供有效的护照首页和签名页。
            <br />
            You are suggested to fill out the form in English or Chinese Pinyin, and upload at
            least the first page of your valid passport with your signature.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <FieldLabel no={1} label="姓 / Surname" required />
                {textInput('lastName', { placeholder: 'ZHANG', autoComplete: 'family-name' })}
              </div>
              <div>
                <FieldLabel no={2} label="名 / First Name" required />
                {textInput('firstName', { placeholder: 'SAN', autoComplete: 'given-name' })}
              </div>
            </div>

            <div>
              <FieldLabel no={3} label="性别 / Gender" required />
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-stone-700">
                {GENDER_OPTIONS.map((o) => (
                  <label key={o.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="gender"
                      value={o.value}
                      checked={gender === o.value}
                      onChange={() => setGender(o.value)}
                      className="accent-[#B8966E]"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel no={4} label="邮箱 / Email" required />
              {textInput('email', { type: 'email', placeholder: 'example@email.com', autoComplete: 'email' })}
            </div>

            <div>
              <FieldLabel no={5} label="带有国家号的手机号码 / Mobile Number" required />
              {textInput('phone', { type: 'tel', placeholder: '如 +8613366666666 或 008613366666666', autoComplete: 'tel' })}
            </div>

            <div>
              <FieldLabel no={6} label="国籍 / Nationality" required />
              {textInput('nationality', { placeholder: 'China' })}
            </div>

            <div>
              <FieldLabel no={7} label="居住国家 / Country of Residence" required />
              {textInput('residenceCountry', { placeholder: 'China' })}
            </div>

            <div>
              <FieldLabel no={8} label="税务所在国 / Country of Tax Residence" required />
              {textInput('taxResidenceCountry', { placeholder: 'China' })}
            </div>

            <div>
              <FieldLabel no={9} label="您的新密码 / Setting your new password" required />
              <p className="text-[11px] leading-relaxed text-stone-400 mb-1.5">{PASSWORD_RULE}</p>
              {textInput('password', { type: 'password', autoComplete: 'new-password' })}
            </div>

            <div>
              <FieldLabel no={10} label="确认您的新密码 / Confirming your password" required />
              {textInput('confirmPassword', { type: 'password', autoComplete: 'new-password' })}
            </div>

            {PROFILE_DOCUMENTS.map((d, i) => (
              <div key={d.type}>
                <FieldLabel no={11 + i} label={d.title} required={d.type === 'passport'} />
                <p className="text-[11px] leading-relaxed text-stone-400 mb-1.5">{d.hint}</p>
                <FilePicker file={files[d.type] ?? null} onChange={(f) => setFile(d.type, f)} />
              </div>
            ))}

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
