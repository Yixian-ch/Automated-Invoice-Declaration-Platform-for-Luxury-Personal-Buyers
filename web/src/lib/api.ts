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
  locale: string;
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

};




// ─── Invoices ─────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type LineItem = {
  description: string;
  quantity?: number;
  amount_ttc?: number;
  confidence: number;
};

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
  lineItems: LineItem[] | null;
  uploadedAt: string | null;
  createdAt: string;
};



export const invoiceApi = {
  /** Upload file directly (multipart POST) */
  upload: (
    token: string,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<Invoice> =>
    new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api/v1/invoices/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.withCredentials = true;
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText)); } catch { reject(new Error('Invalid response')); }
        } else {
          try { reject(new Error(JSON.parse(xhr.responseText).message ?? `上传失败 (${xhr.status})`)); }
          catch { reject(new Error(`上传失败 (${xhr.status})`)); }
        }
      };
      xhr.onerror = () => reject(new Error('网络错误'));
      xhr.send(formData);
    }),

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

export type BrandCashbackRule = {
  id: string;
  displayLabel: string;
  brands: string[];
  rate: string;
  condition: string | null;
  sortOrder: number;
};

export type MerchantCashbackConfig = {
  id: string;
  merchantKey: string;
  displayName: string;
  matchKeywords: string[];
  defaultRate: string;
  notes: string | null;
  isActive: boolean;
  sortOrder: number;
  brandRules: BrandCashbackRule[];
  updatedAt: string;
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

  getCashbackConfigs: (token: string) =>
    request<MerchantCashbackConfig[]>('/admin/cashback-configs', { token }),

  updateMerchantConfig: (
    token: string,
    merchantId: string,
    data: { displayName?: string; matchKeywords?: string[]; defaultRate?: number; notes?: string },
  ) =>
    request<MerchantCashbackConfig>(`/admin/cashback-configs/${merchantId}`, {
      method: 'PUT',
      body: data,
      token,
    }),

  replaceBrandRules: (
    token: string,
    merchantId: string,
    rules: { displayLabel: string; brands: string[]; rate: number; condition?: string; sortOrder?: number }[],
  ) =>
    request<MerchantCashbackConfig>(`/admin/cashback-configs/${merchantId}/brand-rules`, {
      method: 'PUT',
      body: rules,
      token,
    }),
};
