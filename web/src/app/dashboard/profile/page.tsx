'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  authApi,
  userApi,
  type Gender,
  type ProfileDocumentType,
} from '@/lib/api';
import {
  GENDER_OPTIONS,
  PROFILE_DOCUMENTS,
  checkDocumentFile,
  isValidPhone,
} from '@/lib/profile-fields';
import { Button } from '@/components/ui/button';
import { NameWatermark } from '@/components/name-watermark';
import { toast } from 'sonner';

type DocState = {
  uploaded: boolean;
  previewUrl: string | null;
  mimeType: string | null;
  uploading: boolean;
};

const EMPTY_DOC: DocState = { uploaded: false, previewUrl: null, mimeType: null, uploading: false };

const EMPTY_DOCS = Object.fromEntries(
  PROFILE_DOCUMENTS.map((d) => [d.type, EMPTY_DOC]),
) as Record<ProfileDocumentType, DocState>;

function DocumentCard({
  title,
  hint,
  doc,
  onSelect,
}: {
  title: string;
  hint: string;
  doc: DocState;
  onSelect: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="card-luxury space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs tracking-widest uppercase text-muted">{title}</p>
        <span className={`text-xs ${doc.uploaded ? 'text-[#B8966E]' : 'text-muted'}`}>
          {doc.uploaded ? '已上传' : '未上传'}
        </span>
      </div>

      {doc.previewUrl && doc.mimeType?.startsWith('image/') && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={doc.previewUrl}
          alt={title}
          className="max-h-48 w-full object-contain border border-border rounded"
        />
      )}
      {doc.previewUrl && doc.mimeType === 'application/pdf' && (
        <a
          href={doc.previewUrl}
          target="_blank"
          rel="noreferrer"
          className="block text-sm text-[#B8966E] hover:underline"
        >
          查看已上传的 PDF
        </a>
      )}

      <p className="text-xs text-muted">{hint}</p>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onSelect(file);
          e.target.value = '';
        }}
      />
      <Button
        variant="outline"
        disabled={doc.uploading}
        onClick={() => inputRef.current?.click()}
      >
        {doc.uploading ? '上传中…' : doc.uploaded ? '重新上传' : '选择文件'}
      </Button>
    </div>
  );
}

export default function ProfilePage() {
  const { user, isLoading, accessToken, refreshUser } = useAuth();
  const router = useRouter();

  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    lastName: '',
    firstName: '',
    phone: '',
    gender: '' as Gender | '',
    nationality: '',
    residenceCountry: '',
    taxResidenceCountry: '',
    email: '',
    address: '',
    bankAccountName: '',
    bankName: '',
    bankIban: '',
  });
  const [docs, setDocs] = useState<Record<ProfileDocumentType, DocState>>(EMPTY_DOCS);

  useEffect(() => {
    if (!isLoading && !user) router.push('/login');
  }, [user, isLoading, router]);

  // Blob object URLs per document — revoked on replace and on unmount
  const blobUrlsRef = useRef<Partial<Record<ProfileDocumentType, string>>>({});

  useEffect(() => {
    const urls = blobUrlsRef.current;
    return () => {
      Object.values(urls).forEach((u) => u && URL.revokeObjectURL(u));
    };
  }, []);

  const loadDocument = useCallback(
    async (type: ProfileDocumentType) => {
      if (!accessToken) return;
      try {
        const res = await userApi.fetchDocumentUrl(accessToken, type);
        const old = blobUrlsRef.current[type];
        if (old) URL.revokeObjectURL(old);
        blobUrlsRef.current[type] = res?.url;
        setDocs((prev) => ({
          ...prev,
          [type]: {
            ...prev[type],
            uploaded: !!res,
            previewUrl: res?.url ?? null,
            mimeType: res?.mimeType ?? null,
          },
        }));
      } catch {
        // non-fatal — card shows 未上传
      }
    },
    [accessToken],
  );

  useEffect(() => {
    if (!accessToken) return;
    authApi
      .me(accessToken)
      .then((p) => {
        setForm({
          lastName: p.lastName ?? '',
          firstName: p.firstName ?? '',
          phone: p.phone ?? '',
          gender: p.gender ?? '',
          nationality: p.nationality ?? '',
          residenceCountry: p.residenceCountry ?? '',
          taxResidenceCountry: p.taxResidenceCountry ?? '',
          email: p.email ?? '',
          address: p.address ?? '',
          bankAccountName: p.bankAccountName ?? '',
          bankName: p.bankName ?? '',
          bankIban: p.bankIban ?? '',
        });
        PROFILE_DOCUMENTS.forEach((d) => {
          if (p[d.field]) loadDocument(d.type);
        });
      })
      .catch(() => toast.error('加载个人信息失败'));
  }, [accessToken, loadDocument]);

  const handleSave = async () => {
    if (!accessToken) return;
    if (form.phone.trim() && !isValidPhone(form.phone)) {
      toast.error('请填写带国家号的手机号码,如 +8613366666666');
      return;
    }
    setSaving(true);
    try {
      // Send only non-empty fields — an empty email would fail @IsEmail, and
      // empty strings would overwrite existing values with ''
      const trimmed = {
        lastName: form.lastName.trim(),
        firstName: form.firstName.trim(),
        phone: form.phone.trim(),
        gender: form.gender,
        nationality: form.nationality.trim(),
        residenceCountry: form.residenceCountry.trim(),
        taxResidenceCountry: form.taxResidenceCountry.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
        bankAccountName: form.bankAccountName.trim(),
        bankName: form.bankName.trim(),
        bankIban: form.bankIban.trim(),
      };
      const payload = Object.fromEntries(
        Object.entries(trimmed).filter(([, v]) => v !== ''),
      );
      await userApi.updateProfile(accessToken, payload);
      await refreshUser(); // keep the app-wide auth context (header name etc.) in sync
      toast.success('个人信息已保存');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleUpload = async (type: ProfileDocumentType, file: File) => {
    if (!accessToken) return;
    const problem = checkDocumentFile(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setDocs((prev) => ({ ...prev, [type]: { ...prev[type], uploading: true } }));
    try {
      await userApi.uploadDocument(accessToken, type, file);
      toast.success('上传成功');
      await loadDocument(type);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setDocs((prev) => ({ ...prev, [type]: { ...prev[type], uploading: false } }));
    }
  };

  if (isLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="w-px h-10 bg-gold animate-pulse" />
      </main>
    );
  }

  const fields: { key: Exclude<keyof typeof form, 'gender'>; label: string; type?: string }[] = [
    { key: 'lastName', label: '姓' },
    { key: 'firstName', label: '名' },
    { key: 'phone', label: '手机号码(带国家号)', type: 'tel' },
    { key: 'email', label: '邮箱', type: 'email' },
    { key: 'nationality', label: '国籍' },
    { key: 'residenceCountry', label: '居住国家' },
    { key: 'taxResidenceCountry', label: '税务所在国' },
    { key: 'address', label: '地址' },
    { key: 'bankAccountName', label: '收款人姓名' },
    { key: 'bankName', label: '银行名称' },
    { key: 'bankIban', label: '收款银行账户' },
  ];

  return (
    <main className="relative min-h-screen flex flex-col">
      <NameWatermark />
      {/* 导航栏 */}
      <header className="relative z-10 border-b border-border px-8 py-4 flex items-center justify-between">
        <span className="text-sm tracking-[0.2em] uppercase" style={{ fontFamily: 'var(--font-serif)' }}>
          LIDP
        </span>
        <nav className="flex items-center gap-6">
          <button onClick={() => router.push('/dashboard')} className="btn-ghost text-xs">
            返回工作台
          </button>
        </nav>
      </header>

      <div className="relative z-10 flex-1 px-8 py-12 max-w-3xl mx-auto w-full space-y-10">
        <div>
          <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
            我的主页
          </h1>
          <div className="w-8 h-px bg-gold mt-3" />
        </div>

        {/* 基本信息 */}
        <div className="card-luxury space-y-6">
          <p className="text-xs tracking-widest uppercase text-muted">基本信息</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted mb-1.5">性别</label>
              <select
                value={form.gender}
                onChange={(e) => setForm((prev) => ({ ...prev, gender: e.target.value as Gender | '' }))}
                className="input-luxury w-full"
              >
                <option value="" disabled>
                  请选择
                </option>
                {GENDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {fields.map((f) => (
              <div key={f.key} className={f.key === 'address' || f.key === 'bankIban' ? 'sm:col-span-2' : ''}>
                <label className="block text-xs text-muted mb-1.5">{f.label}</label>
                <input
                  type={f.type ?? 'text'}
                  value={form[f.key]}
                  onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  className="input-luxury w-full"
                />
              </div>
            ))}
          </div>
          <Button
            onClick={handleSave}
            disabled={saving}
            style={{ backgroundColor: '#B8966E', color: 'white' }}
          >
            {saving ? '保存中…' : '保存'}
          </Button>
        </div>

        {/* 证件材料 */}
        <div className="space-y-4">
          <p className="text-xs tracking-widest uppercase text-muted">证件材料</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PROFILE_DOCUMENTS.map((d) => (
              <DocumentCard
                key={d.type}
                title={d.title}
                hint={`${d.hint} 支持 PDF / JPEG / PNG,不超过 10 MB。`}
                doc={docs[d.type]}
                onSelect={(file) => handleUpload(d.type, file)}
              />
            ))}
          </div>
        </div>

        {/* 常见问题 */}
        <div className="card-luxury space-y-5">
          <p className="text-xs tracking-widest uppercase text-muted">常见问题</p>
          {[
            {
              q: '资料好多，都需要填写吗？',
              a: 'Ruichi 依照正规法律途径为大家处理返点，文件和法律缺一不可，填写完成才能通过法务审核。',
            },
            {
              q: '文件过期了怎么办？',
              a: '文件过期没关系，可以先提交文件。等到结算返点时，缴交有效的文件即可。',
            },
            {
              q: '营业执照一定要本人名下吗？',
              a: '需要导游证或营业执照，一定要本人名下，可以使用个体工商户。如果皆没有，可以挂他人名下，以他人名义返点。',
            },
          ].map((item) => (
            <div key={item.q} className="space-y-1">
              <p className="text-sm font-medium text-stone-800">{item.q}</p>
              <p className="text-sm leading-relaxed text-stone-600">{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
