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
  phone: string | null;
  address: string | null;
  passportDocumentKey: string | null;
  businessLicenseKey: string | null;
  bankAccountName: string | null;
  bankIban: string | null;
  bankBic: string | null;
};

export type ProfileDocumentType = 'passport' | 'business-license';

export type UpdateProfilePayload = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  bankAccountName?: string;
  bankIban?: string;
  bankBic?: string;
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

// ─── User profile ─────────────────────────────────────────────────────────────

export const userApi = {
  updateProfile: (token: string, data: UpdateProfilePayload) =>
    request<UserProfile>('/users/me', { method: 'PATCH', body: data, token }),

  /** Upload a profile document (multipart POST) */
  uploadDocument: async (
    token: string,
    type: ProfileDocumentType,
    file: File,
  ): Promise<{ type: string; uploaded: boolean }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/api/v1/users/me/documents/${type}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
      body: formData,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error((error as { message: string }).message ?? '上传失败');
    }
    return res.json();
  },

  /** Fetch a profile document as a blob URL (null when none uploaded) */
  fetchDocumentUrl: async (
    token: string,
    type: ProfileDocumentType,
  ): Promise<{ url: string; mimeType: string } | null> => {
    const res = await fetch(`${API_BASE}/api/v1/users/me/documents/${type}`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('文档加载失败');
    const blob = await res.blob();
    return { url: URL.createObjectURL(blob), mimeType: blob.type };
  },
};




// ─── Invoices ─────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type LineItem = {
  description: string;
  quantity?: number;
  amount_ttc?: number;
  confidence: number;
};

/** Per-product cashback detail computed by the backend */
export type CashbackBreakdownItem = {
  description: string;
  brand: string | null;
  itemCategory: string | null;
  amountTTC: number;
  merchantRate: number;
  brandRate: number;
  cashback: number;
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
  cashbackBreakdown: CashbackBreakdownItem[] | null;
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

// ─── Cashback settlements ─────────────────────────────────────────────────────

export type PendingCashback = {
  id: string;
  vendorName: string | null;
  purchaseDate: string | null;
  grandTotalAmount: string | null;
  cashbackAmount: string;
  currency: string | null;
};

export type SettlementStatus = 'CONFIRMED' | 'SENT' | 'PAID' | 'FAILED';

export type SettlementMethod = 'BANK_TRANSFER' | 'VOUCHER' | 'GIFT_CARD';

export type Settlement = {
  id: string;
  invoiceId: string;
  amount: string;
  method: SettlementMethod;
  status: SettlementStatus;
  bankIban: string | null;
  failureReason: string | null;
  confirmedAt: string;
  sentAt: string | null;
  paidAt: string | null;
  invoice: { vendorName: string | null; purchaseDate: string | null; grandTotalAmount: string | null };
};

export type ConfirmSettlementPayload = {
  invoiceId: string;
  method: SettlementMethod;
  bankAccountName?: string;
  bankIban?: string;
  bankBic?: string;
  saveBankInfo?: boolean;
};

export const settlementApi = {
  /** Approved invoices awaiting cashback confirmation */
  pending: (token: string) => request<PendingCashback[]>('/settlements/pending', { token }),

  /** Settlement history */
  mine: (token: string) => request<Settlement[]>('/settlements/mine', { token }),

  /** Confirm cashback + trigger automatic payout */
  confirm: (token: string, data: ConfirmSettlementPayload) =>
    request<Settlement>('/settlements', { method: 'POST', body: data, token }),

  /** Retry a failed payout */
  retry: (token: string, settlementId: string) =>
    request<Settlement>(`/settlements/${settlementId}/retry`, { method: 'POST', token }),
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
