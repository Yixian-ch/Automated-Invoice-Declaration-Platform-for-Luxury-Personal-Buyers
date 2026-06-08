'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { invoiceApi, type Invoice, type InvoiceStatus } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  PENDING_UPLOAD: 'Pending',
  UPLOADED: 'Pending',
  OCR_PROCESSING: 'Pending',
  OCR_DONE: 'Pending',
  NEEDS_REVIEW: 'Reviewing',
  FRAUD_REVIEW: 'Reviewing',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  BLACKLISTED: 'Rejected',
};

const STATUS_VARIANT: Record<InvoiceStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PENDING_UPLOAD: 'outline',
  UPLOADED: 'secondary',
  OCR_PROCESSING: 'secondary',
  OCR_DONE: 'secondary',
  NEEDS_REVIEW: 'outline',
  FRAUD_REVIEW: 'outline',
  APPROVED: 'default',
  REJECTED: 'destructive',
  BLACKLISTED: 'destructive',
};

const PROCESSING_STATUSES: InvoiceStatus[] = ['PENDING_UPLOAD', 'UPLOADED', 'OCR_PROCESSING'];

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-3 border-b border-stone-100 last:border-0">
      <p className="text-xs tracking-widest uppercase text-muted mb-0.5">{label}</p>
      <p className="text-sm text-stone-800">{value ?? '—'}</p>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { accessToken, isLoading: authLoading, user } = useAuth();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInvoice = async () => {
    if (!accessToken || !id) return;
    try {
      const data = await invoiceApi.get(id, accessToken);
      setInvoice(data);
      setError(null);
      return data;
    } catch (e: any) {
      setError(e.message ?? 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!accessToken) return;
    fetchInvoice();
  }, [accessToken, id]);

  // Poll while OCR is still running
  useEffect(() => {
    if (!invoice) return;
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
    if (PROCESSING_STATUSES.includes(invoice.status) && accessToken) {
      pollRef.current = setTimeout(fetchInvoice, 4000);
    }
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [invoice?.status, accessToken]);

  if (authLoading || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="w-px h-10 bg-gold animate-pulse" />
      </main>
    );
  }

  if (error || !invoice) {
    return (
      <main className="min-h-screen flex flex-col">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-muted text-sm">{error ?? 'Invoice not found'}</p>
            <button onClick={() => router.push('/dashboard')} className="btn-ghost text-sm">
              ← Back to Dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  const isProcessing = PROCESSING_STATUSES.includes(invoice.status);
  const isApproved = invoice.status === 'APPROVED';
  const imageUrl = `${API_BASE}/api/v1/invoices/${id}/image`;

  const confidence =
    invoice.ocrConfidence != null
      ? `${Math.round(invoice.ocrConfidence * 100)}%`
      : null;

  return (
    <main className="min-h-screen flex flex-col bg-surface">
      <Header />

      <div className="flex-1 px-8 py-10 max-w-5xl mx-auto w-full">
        {/* Back link */}
        <button
          onClick={() => router.push('/dashboard')}
          className="btn-ghost text-xs mb-8 flex items-center gap-1"
        >
          ← Back to Dashboard
        </button>

        {/* Page title */}
        <div className="mb-8">
          <h1 className="text-3xl font-light" style={{ fontFamily: 'var(--font-serif)' }}>
            Invoice Detail
          </h1>
          <div className="w-8 h-px bg-gold mt-3" />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

          {/* Left — receipt image */}
          <div className="card-luxury flex flex-col items-center justify-center min-h-[400px]">
            {imgError ? (
              <div className="text-center space-y-2 text-muted">
                <p className="text-4xl">🧾</p>
                <p className="text-sm">Image not available</p>
                {invoice.originalFilename && (
                  <p className="text-xs text-stone-400">{invoice.originalFilename}</p>
                )}
              </div>
            ) : (
              <img
                src={imageUrl}
                alt={invoice.originalFilename ?? 'Invoice'}
                onError={() => setImgError(true)}
                className="max-w-full max-h-[600px] object-contain rounded"
              />
            )}
          </div>

          {/* Right — OCR results */}
          <div className="card-luxury">
            {isProcessing ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[200px] space-y-4 text-center">
                <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted">Analyzing receipt…</p>
                <p className="text-xs text-stone-400">
                  This usually takes 10–30 seconds. The page will update automatically.
                </p>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs tracking-widest uppercase text-muted">OCR Results</p>
                  <Badge variant={STATUS_VARIANT[invoice.status]}>
                    {STATUS_LABEL[invoice.status]}
                  </Badge>
                </div>

                <div className="divide-y divide-stone-100">
                  <Field label="Store" value={invoice.vendorName} />
                  <Field label="Brand" value={invoice.brandName} />
                  <Field
                    label="Purchase Date"
                    value={
                      invoice.purchaseDate
                        ? new Date(invoice.purchaseDate).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'long',
                            year: 'numeric',
                          })
                        : null
                    }
                  />
                  <Field
                    label="Amount"
                    value={
                      invoice.grandTotalAmount
                        ? `${invoice.currency ?? '€'} ${Number(invoice.grandTotalAmount).toFixed(2)}`
                        : null
                    }
                  />
                  <Field
                    label="OCR Confidence"
                    value={
                      confidence ? (
                        <span className={Number(invoice.ocrConfidence) >= 0.8 ? 'text-green-700' : 'text-amber-600'}>
                          {confidence}
                        </span>
                      ) : null
                    }
                  />
                  {isApproved && (
                    <div className="py-3">
                      <p className="text-xs tracking-widest uppercase text-muted mb-0.5">Cashback</p>
                      <p className="text-xl font-light text-gold" style={{ fontFamily: 'var(--font-serif)' }}>
                        {invoice.cashbackAmount
                          ? `€${Number(invoice.cashbackAmount).toFixed(2)}`
                          : '—'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-stone-100">
                  <p className="text-xs text-stone-400">
                    Uploaded{' '}
                    {invoice.uploadedAt
                      ? new Date(invoice.uploadedAt).toLocaleString('fr-FR', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })
                      : new Date(invoice.createdAt).toLocaleString('fr-FR', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function Header() {
  return (
    <header className="border-b border-border px-8 py-4 flex items-center justify-between">
      <span className="text-sm tracking-[0.2em] uppercase" style={{ fontFamily: 'var(--font-serif)' }}>
        LIDP
      </span>
    </header>
  );
}
