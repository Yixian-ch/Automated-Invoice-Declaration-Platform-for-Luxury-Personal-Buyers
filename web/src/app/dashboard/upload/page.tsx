'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { invoiceApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const ACCEPTED_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
};
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

type UploadStep = 'idle' | 'requesting' | 'uploading' | 'confirming' | 'done' | 'error';

export default function UploadPage() {
  const { accessToken } = useAuth();
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<UploadStep>('idle');
  const [progress, setProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── File selection ────────────────────────────────────────────────────────

  const selectFile = useCallback((f: File) => {
    if (!ACCEPTED_TYPES[f.type]) {
      toast.error('Only PDF, JPEG or PNG files are accepted.');
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error('File must be smaller than 10 MB.');
      return;
    }
    setFile(f);
    setStep('idle');
    setProgress(0);
  }, []);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) selectFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) selectFile(f);
  };

  // ─── Upload flow ───────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!file || !accessToken) return;

    try {
      // 1. Request presigned URL from backend
      setStep('requesting');
      const { invoiceId, presignedUrl } = await invoiceApi.getUploadUrl(
        {
          mimeType: file.type,
          originalFilename: file.name,
          fileSizeBytes: String(file.size),
        },
        accessToken,
      );

      // 2. Upload directly to S3 via XHR (so we can track progress)
      setStep('uploading');
      await uploadToS3(presignedUrl, file, (pct) => setProgress(pct));

      // 3. Confirm upload → triggers OCR job
      setStep('confirming');
      await invoiceApi.confirm(invoiceId, accessToken);

      setStep('done');
      toast.success('Invoice uploaded — OCR processing has started.');
      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (err) {
      setStep('error');
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const isBusy = step === 'requesting' || step === 'uploading' || step === 'confirming';

  return (
    <div className="min-h-screen bg-[#FAF9F7] flex flex-col">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-stone-500 hover:text-stone-800 text-sm"
        >
          ← Back
        </button>
        <h1
          className="text-xl font-semibold text-stone-800"
          style={{ fontFamily: 'Cormorant Garamond, serif' }}
        >
          Upload Invoice
        </h1>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-start justify-center p-8">
        <div className="w-full max-w-xl space-y-6">

          {/* Drop zone */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
            onDrop={onDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            className={`
              rounded-xl border-2 border-dashed p-12 text-center cursor-pointer
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
              className="hidden"
              onChange={onInputChange}
            />
            <div className="text-4xl mb-3">📄</div>
            {file ? (
              <div>
                <p className="font-medium text-stone-800">{file.name}</p>
                <p className="text-sm text-stone-500 mt-1">
                  {ACCEPTED_TYPES[file.type]} · {(file.size / 1024).toFixed(0)} KB
                </p>
                <p className="text-xs text-[#B8966E] mt-2">Click to change file</p>
              </div>
            ) : (
              <div>
                <p className="font-medium text-stone-700">
                  Drag &amp; drop your invoice here
                </p>
                <p className="text-sm text-stone-400 mt-1">
                  or click to browse — PDF, JPEG, PNG · max 10 MB
                </p>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {step === 'uploading' && (
            <div>
              <div className="flex justify-between text-xs text-stone-500 mb-1">
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-stone-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#B8966E] rounded-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Status message */}
          {step === 'requesting' && (
            <p className="text-sm text-stone-500 text-center">Preparing upload…</p>
          )}
          {step === 'confirming' && (
            <p className="text-sm text-stone-500 text-center">
              Finalising &amp; queuing OCR…
            </p>
          )}
          {step === 'done' && (
            <p className="text-sm text-[#B8966E] text-center font-medium">
              ✓ Upload complete — redirecting to dashboard…
            </p>
          )}

          {/* CTA */}
          <Button
            onClick={handleUpload}
            disabled={!file || isBusy || step === 'done'}
            className="w-full"
            style={{ backgroundColor: '#B8966E', color: 'white' }}
          >
            {isBusy ? 'Processing…' : 'Submit Invoice'}
          </Button>

          {/* Info */}
          <p className="text-xs text-stone-400 text-center leading-relaxed">
            Your invoice is stored securely in our EU data centre (AWS Paris).
            OCR processing extracts key fields automatically; a reviewer may
            follow up within 2 business days.
          </p>
        </div>
      </main>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uploadToS3(
  presignedUrl: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve();
      } else {
        reject(new Error(`S3 upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}
