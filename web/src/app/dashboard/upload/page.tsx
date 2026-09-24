'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { invoiceApi } from '@/lib/api';
import { compressImageForUpload, formatBytes } from '@/lib/image-compress';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const ACCEPTED_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
};
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB(服务端上限,PDF 与压缩后的图片都按它检查)
const MAX_RAW_IMAGE_BYTES = 40 * 1024 * 1024; // 原始照片可以更大,上传前会压缩

type FileStatus = 'pending' | 'compressing' | 'uploading' | 'done' | 'error';

type FileItem = {
  id: string;
  file: File;
  status: FileStatus;
  progress: number;
  error?: string;
  /** 压缩后实际上传的体积(仅图片被压缩时有) */
  uploadedBytes?: number;
};

export default function UploadPage() {
  const { accessToken } = useAuth();
  const router = useRouter();

  const [items, setItems] = useState<FileItem[]>([]);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 去重不再按文件名判断:服务端 OCR 后按小票条形码号全局去重
  const addFiles = useCallback((incoming: File[]) => {
    const valid: File[] = [];
    for (const f of incoming) {
      if (!ACCEPTED_TYPES[f.type]) {
        toast.error(`${f.name}：仅支持 PDF、JPEG 或 PNG 格式。`);
        continue;
      }
      // 图片上传前会压缩,原图允许更大;PDF 不压缩,直接按服务端上限检查
      const isImage = f.type.startsWith('image/');
      if (isImage ? f.size > MAX_RAW_IMAGE_BYTES : f.size > MAX_BYTES) {
        toast.error(`${f.name}：文件超过 ${isImage ? '40' : '10'} MB 限制。`);
        continue;
      }
      valid.push(f);
    }
    if (!valid.length) return;

    setItems((prev) => [
      ...prev,
      ...valid.map<FileItem>((f) => ({
        id: Math.random().toString(36).slice(2),
        file: f,
        status: 'pending',
        progress: 0,
      })),
    ]);
  }, []);

  const removeItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) addFiles(files);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) addFiles(files);
  };

  const updateItem = (id: string, patch: Partial<FileItem>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const handleUpload = async () => {
    if (!accessToken) return;
    const pending = items.filter((i) => i.status === 'pending');
    if (!pending.length) return;

    setRunning(true);

    for (const item of pending) {
      try {
        // 先在浏览器里压缩照片(长边 2000px、JPEG 0.85),再上传
        updateItem(item.id, { status: 'compressing', progress: 0 });
        const { file: toUpload, compressed } = await compressImageForUpload(item.file);
        if (toUpload.size > MAX_BYTES) {
          throw new Error(`压缩后仍超过 10 MB(${formatBytes(toUpload.size)}),请换一张分辨率低一些的照片`);
        }

        updateItem(item.id, {
          status: 'uploading',
          progress: 0,
          uploadedBytes: compressed ? toUpload.size : undefined,
        });

        await invoiceApi.upload(accessToken, toUpload, (pct) =>
          updateItem(item.id, { progress: pct }),
        );

        updateItem(item.id, { status: 'done', progress: 100 });
      } catch (err) {
        updateItem(item.id, {
          status: 'error',
          error: err instanceof Error ? err.message : '上传失败',
        });
      }
    }

    setRunning(false);
  };

  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const doneCount = items.filter((i) => i.status === 'done').length;
  const errorCount = items.filter((i) => i.status === 'error').length;
  const allSettled =
    items.length > 0 &&
    items.every((i) => i.status === 'done' || i.status === 'error');

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col">
      {/* 顶部栏 */}
      <header className="border-b border-stone-200 bg-white px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-stone-500 hover:text-stone-800 text-sm"
        >
          ← 返回
        </button>
        <h1
          className="text-xl font-semibold text-stone-800"
          style={{ fontFamily: 'Cormorant Garamond, serif' }}
        >
          上传小票
        </h1>
      </header>

      {/* 内容区 */}
      <main className="flex-1 flex items-start justify-center p-8">
        <div className="w-full max-w-xl space-y-6">

          {/* 拖拽区域 */}
          {!running && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
              onDrop={onDrop}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              className={`
                rounded-xl border-2 border-dashed p-10 text-center cursor-pointer
                transition-colors select-none
                ${dragOver
                  ? 'border-[#B8966E] bg-amber-50'
                  : 'border-stone-300 bg-white hover:border-[#B8966E] hover:bg-amber-50/40'
                }
              `}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                multiple
                className="hidden"
                onChange={onInputChange}
              />
              <div className="text-4xl mb-3">📄</div>
              <p className="font-medium text-stone-700">
                拖拽小票至此处
              </p>
              <p className="text-sm text-stone-400 mt-1">
                或点击选择文件 — PDF、JPEG、PNG；照片会自动压缩后上传
              </p>
              <p className="text-xs text-[#B8966E] mt-2 font-medium">
                支持多文件上传
              </p>
            </div>
          )}

          {/* 文件列表 */}
          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((item) => (
                <FileRow
                  key={item.id}
                  item={item}
                  onRemove={running ? undefined : () => removeItem(item.id)}
                />
              ))}
            </div>
          )}

          {/* 结果横幅 */}
          {allSettled && (
            <div
              className={`rounded-xl border px-6 py-5 text-center ${
                errorCount > 0
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-green-200 bg-green-50'
              }`}
            >
              <p className="text-2xl mb-1">{errorCount > 0 ? '⚠️' : '✅'}</p>
              <p
                className={`font-semibold text-base ${
                  errorCount > 0 ? 'text-amber-800' : 'text-green-800'
                }`}
              >
                {doneCount} 张小票上传成功
                {errorCount > 0 && `，${errorCount} 张失败`}
              </p>
              {doneCount > 0 && (
                <p className="text-sm text-green-700 mt-1">
                  已进入识别与自动审核队列,可以离开本页。识别完成后请到工作台查看每张小票的结果:
                  照片不清晰、重复提交或非预约购物的小票会被自动拒绝并注明原因。
                </p>
              )}
              {doneCount > 0 && (
                <button
                  onClick={() => router.push('/dashboard')}
                  className="mt-3 text-sm text-[#B8966E] hover:underline"
                >
                  返回工作台 →
                </button>
              )}
            </div>
          )}

          {/* 上传按钮 */}
          <Button
            onClick={handleUpload}
            disabled={pendingCount === 0 || running}
            className="w-full"
            style={{ backgroundColor: '#B8966E', color: 'white' }}
          >
            {running
              ? '上传中…'
              : pendingCount > 0
                ? `提交 ${pendingCount} 张小票`
                : '请先选择文件'}
          </Button>

          <p className="text-xs text-stone-400 text-center leading-relaxed">
            上传后系统自动识别并校验(照片清晰度、条形码去重、预约匹配),通过后审核员将在 2 个工作日内完成审核。
            同一张小票请勿重复上传;照片请拍摄完整、清晰、无反光。
          </p>
        </div>
      </main>
    </div>
  );
}

// ─── 文件行 ───────────────────────────────────────────────────────────────────

function FileRow({
  item,
  onRemove,
}: {
  item: FileItem;
  onRemove?: () => void;
}) {
  const label = {
    pending: '待上传',
    compressing: '压缩中…',
    uploading: `${item.progress}%`,
    done: '完成 ✓',
    error: item.error ?? '上传失败',
  }[item.status];

  const labelColor = {
    pending: 'text-stone-400',
    compressing: 'text-[#B8966E]',
    uploading: 'text-[#B8966E]',
    done: 'text-green-600',
    error: 'text-red-500',
  }[item.status];

  const borderColor = {
    pending: 'border-stone-200',
    compressing: 'border-[#B8966E]/30',
    uploading: 'border-[#B8966E]/30',
    done: 'border-green-200',
    error: 'border-red-200',
  }[item.status];

  return (
    <div className={`rounded-lg border bg-white px-4 py-3 ${borderColor}`}>
      <div className="flex items-center gap-3">
        <span className="text-lg shrink-0">
          {item.file.type === 'application/pdf' ? '📄' : '🖼️'}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-stone-800 truncate">
            {item.file.name}
          </p>
          <p className="text-xs text-stone-400">
            {ACCEPTED_TYPES[item.file.type]} · {formatBytes(item.file.size)}
            {item.uploadedBytes != null && (
              <span className="text-stone-400"> → 压缩后 {formatBytes(item.uploadedBytes)}</span>
            )}
          </p>
        </div>
        <span className={`text-xs font-medium shrink-0 ${labelColor}`}>
          {label}
        </span>
        {onRemove && (
          <button
            onClick={onRemove}
            className="text-stone-300 hover:text-stone-500 text-sm shrink-0 ml-1"
            aria-label="移除文件"
          >
            ✕
          </button>
        )}
      </div>
      {item.status === 'uploading' && (
        <div className="mt-2 h-1 bg-stone-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#B8966E] rounded-full transition-all duration-150"
            style={{ width: `${item.progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
