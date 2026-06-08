/** Typed API client — thin wrapper around fetch with auth token injection */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method,
    headers,
    credentials: 'include', // send httpOnly refresh cookie
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((error as { message: string }).message ?? 'Request failed');
  }

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export type RegisterPayload = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  locale?: string;
  /** Path B — employee invite */
  inviteCode?: string;
  /** Path A — self-registration */
  accountType?: 'INDIVIDUAL' | 'ORGANIZATION';
  companyName?: string;
  companyRegistrationNo?: string;
};

export type LoginPayload = { email: string; password: string };

export type AuthResponse = {
  accessToken: string;
  user: UserProfile;
};

export type UserProfile = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status: string;
  kycStatus: string;
  kybStatus: string;
  accountType: string;
  organizationId: string | null;
  locale: string;
  registeredViaInvite: boolean;
};

export const authApi = {
  register: (data: RegisterPayload) =>
    request<{ message: string }>('/auth/register', { method: 'POST', body: data }),

  login: (data: LoginPayload) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: data }),

  logout: (token: string) =>
    request<{ message: string }>('/auth/logout', { method: 'POST', token }),

  refresh: () =>
    request<{ accessToken: string }>('/auth/refresh', { method: 'POST' }),

  me: (token: string) =>
    request<UserProfile>('/users/me', { token }),

  verifyEmail: (token: string) =>
    request<{ message: string }>(`/auth/verify-email/${encodeURIComponent(token)}`, { method: 'GET' }),
};

// ─── Invites ──────────────────────────────────────────────────────────────────

export type InvitePayload = {
  intendedRole: string;
  intendedOrgId?: string;
  expiryHours?: number;
};

export const inviteApi = {
  create: (data: InvitePayload, token: string) =>
    request<{ id: string; code: string; expiresAt: string }>('/invites', {
      method: 'POST',
      body: data,
      token,
    }),
  listAll: (token: string) =>
    request<unknown[]>('/invites', { token }),
};

// ─── KYC ─────────────────────────────────────────────────────────────────────

export const kycApi = {
  startSession: (type: 'kyc' | 'kyb', originalFilename: string, mimeType: string, token: string) =>
    request<{ uploadId: string; presignedUrl: string; s3Key: string }>(
      '/kyc/session',
      { method: 'POST', body: { type, originalFilename, mimeType }, token },
    ),
  confirm: (s3Key: string, token: string) =>
    request('/kyc/confirm', { method: 'POST', body: { s3Key }, token }),
  adminApprove: (userId: string, note: string | undefined, token: string) =>
    request(`/kyc/${encodeURIComponent(userId)}/approve`, { method: 'POST', body: { note }, token }),
  adminReject: (userId: string, note: string | undefined, token: string) =>
    request(`/kyc/${encodeURIComponent(userId)}/reject`, { method: 'POST', body: { note }, token }),
};

// ─── Invoices ─────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type Invoice = {
  id: string;
  status: InvoiceStatus;
  originalFilename: string | null;
  mimeType: string | null;
  fileSizeBytes: number | null;
  invoiceNumber: string | null;
  purchaseDate: string | null;
  vendorName: string | null;
  brandName: string | null;
  currency: string | null;
  grandTotalAmount: string | null;
  cashbackAmount: string | null;
  ocrConfidence: number | null;
  needsReview: boolean | null;
  reviewReasons: string[] | null;
  uploadedAt: string | null;
  createdAt: string;
};

export type UploadUrlResponse = {
  invoiceId: string;
  presignedUrl: string;
  s3Key: string;
};

export const invoiceApi = {
  /** Step 1: get a presigned PUT URL from the backend */
  getUploadUrl: (
    data: { mimeType: string; originalFilename: string; fileSizeBytes?: string },
    token: string,
  ) =>
    request<UploadUrlResponse>('/invoices/upload-url', {
      method: 'POST',
      body: data,
      token,
    }),

  /** Step 2: after S3 upload, confirm to trigger OCR */
  confirm: (invoiceId: string, token: string) =>
    request<Invoice>(`/invoices/${invoiceId}/confirm`, { method: 'POST', token }),

  /** List current user's invoices */
  list: (token: string, page = 1) =>
    request<{ items: Invoice[]; total: number; page: number; limit: number }>(
      `/invoices?page=${page}`,
      { token },
    ),

  /** Get single invoice */
  get: (invoiceId: string, token: string) =>
    request<Invoice>(`/invoices/${invoiceId}`, { token }),
};

// ─── Admin ────────────────────────────────────────────────────────────────────

export type AdminInvoice = Invoice & {
  user: { id: string; firstName: string; lastName: string; email: string };
};

export type ReconciliationRow = {
  merchant_name: string;
  invoice_date: string;
  invoices_total: string;
  bill_total: string;
  status: 'MATCH' | 'MISMATCH';
};

export type DrillDownRow = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  vendorName: string | null;
  purchaseDate: string | null;
  grandTotalAmount: string | null;
  cashbackAmount: string | null;
  originalFilename: string | null;
  status: string;
};

export type MerchantBill = {
  id: string;
  merchantName: string;
  date: string;
  totalAmount: string;
  importedAt: string;
};

export type AdminUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  cashbackRate: string | null;
};

export const adminApi = {
  listInvoices: (token: string, params?: { status?: string; userId?: string; page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.userId) qs.set('userId', params.userId);
    if (params?.page) qs.set('page', String(params.page));
    return request<{ items: AdminInvoice[]; total: number; page: number; limit: number }>(
      `/invoices/admin/all?${qs}`,
      { token },
    );
  },

  approve: (token: string, invoiceId: string, note?: string) =>
    request<Invoice>(`/invoices/${invoiceId}/approve`, { method: 'POST', body: { note }, token }),

  reject: (token: string, invoiceId: string, note: string) =>
    request<Invoice>(`/invoices/${invoiceId}/reject`, { method: 'POST', body: { note }, token }),

  getReconciliation: (token: string) =>
    request<ReconciliationRow[]>('/admin/reconciliation', { token }),

  getDrillDown: (token: string, merchantName: string, date: string) => {
    const qs = new URLSearchParams({ merchantName, date });
    return request<DrillDownRow[]>(`/admin/reconciliation/drill-down?${qs}`, { token });
  },

  importMerchantBills: (
    token: string,
    bills: { merchantName: string; date: string; totalAmount: number }[],
  ) =>
    request<{ imported: number }>('/admin/merchant-bills', { method: 'POST', body: bills, token }),

  listMerchantBills: (token: string) =>
    request<MerchantBill[]>('/admin/merchant-bills', { token }),

  listUsers: (token: string) => request<AdminUser[]>('/admin/users', { token }),

  updateCashbackRate: (token: string, userId: string, cashbackRate: number) =>
    request<AdminUser>(`/admin/users/${userId}/cashback-rate`, {
      method: 'PATCH',
      body: { cashbackRate },
      token,
    }),

  correctInvoice: (
    token: string,
    invoiceId: string,
    data: { vendorName?: string; purchaseDate?: string; grandTotalAmount?: string },
  ) =>
    request<Invoice>(`/invoices/${invoiceId}/correct`, {
      method: 'PATCH',
      body: data,
      token,
    }),

  deleteInvoice: (token: string, invoiceId: string) =>
    request<void>(`/invoices/${invoiceId}`, { method: 'DELETE', token }),
};
