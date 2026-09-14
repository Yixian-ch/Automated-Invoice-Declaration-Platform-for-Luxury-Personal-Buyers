'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  authApi,
  userApi,
  type ProfileDocumentType,
  type UserProfile,
} from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const ACCEPTED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

type DocState = {
  uploaded: boolean;
  previewUrl: string | null;
  mimeType: string | null;
  uploading: boolean;
};

const EMPTY_DOC: DocState = { uploaded: false, previewUrl: null, mimeType: null, uploading: false };

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

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    lastName: '',
    firstName: '',
    phone: '',
    email: '',
    address: '',
  });
  const [docs, setDocs] = useState<Record<ProfileDocumentType, DocState>>({
    passport: EMPTY_DOC,
    'business-license': EMPTY_DOC,
  });

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
        setProfile(p);
        setForm({
          lastName: p.lastName ?? '',
          firstName: p.firstName ?? '',
          phone: p.phone ?? '',
          email: p.email ?? '',
          address: p.address ?? '',
        });
        if (p.kycDocumentKey) loadDocument('passport');
        if (p.kybDocumentKey) loadDocument('business-license');
      })
      .catch(() => toast.error('加载个人信息失败'));
  }, [accessToken, loadDocument]);

  const handleSave = async () => {
    if (!accessToken) return;
    setSaving(true);
    try {
      // Send only non-empty fields — an empty email would fail @IsEmail, and
      // empty strings would overwrite existing values with ''
      const trimmed = {
        lastName: form.lastName.trim(),
        firstName: form.firstName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        address: form.address.trim(),
      };
      const payload = Object.fromEntries(
        Object.entries(trimmed).filter(([, v]) => v !== ''),
      );
      const updated = await userApi.updateProfile(accessToken, payload);
      setProfile(updated);
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
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('仅支持 PDF、JPEG 或 PNG 格式');
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error('文件超过 10 MB 限制');
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

  const fields: { key: keyof typeof form; label: string; type?: string }[] = [
    { key: 'lastName', label: '姓' },
    { key: 'firstName', label: '名' },
    { key: 'phone', label: '电话', type: 'tel' },
    { key: 'email', label: '邮箱', type: 'email' },
    { key: 'address', label: '地址' },
  ];

  return (
    <main className="min-h-screen flex flex-col">
      {/* 导航栏 */}
      <header className="border-b border-border px-8 py-4 flex items-center justify-between">
        <span className="text-sm tracking-[0.2em] uppercase" style={{ fontFamily: 'var(--font-serif)' }}>
          LIDP
        </span>
        <nav className="flex items-center gap-6">
          <button onClick={() => router.push('/dashboard')} className="btn-ghost text-xs">
            返回工作台
          </button>
        </nav>
      </header>

      <div className="flex-1 px-8 py-12 max-w-3xl mx-auto w-full space-y-10">
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
            {fields.map((f) => (
              <div key={f.key} className={f.key === 'address' ? 'sm:col-span-2' : ''}>
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
            <DocumentCard
              title="护照"
              hint="上传护照信息页，支持 PDF / JPEG / PNG，不超过 10 MB。"
              doc={docs.passport}
              onSelect={(file) => handleUpload('passport', file)}
            />
            <DocumentCard
              title="营业执照"
              hint="企业账户请上传营业执照，支持 PDF / JPEG / PNG，不超过 10 MB。"
              doc={docs['business-license']}
              onSelect={(file) => handleUpload('business-license', file)}
            />
          </div>
        </div>

        {profile && (
          <p className="text-xs text-muted">
            账户状态：{profile.status} · 角色：{profile.role}
          </p>
        )}
      </div>
    </main>
  );
}
