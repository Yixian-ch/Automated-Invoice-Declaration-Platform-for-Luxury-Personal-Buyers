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
  bankName: string | null;
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
  bankName?: string;
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

export type InvoiceStatus =
  | 'PENDING'               // 人工审核中
  | 'APPROVED'              // 旧状态,兼容
  | 'REJECTED'
  | 'AWAITING_CONFIRMATION' // 待客户确认返点金额
  | 'CONFIRMED'             // 客户已确认,金额锁定
  | 'DISPUTED';             // 客户对金额有异议

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  PENDING: '审核中',
  APPROVED: '已通过',
  REJECTED: '审核失败',
  AWAITING_CONFIRMATION: '待确认返点',
  CONFIRMED: '已确认',
  DISPUTED: '异议处理中',
};

export type DisputeCategory = 'AMOUNT_WRONG' | 'ITEMS_WRONG' | 'OTHER';

export const DISPUTE_CATEGORY_LABEL: Record<DisputeCategory, string> = {
  AMOUNT_WRONG: '金额算错',
  ITEMS_WRONG: '明细不对',
  OTHER: '其他',
};

export type LineItem = {
  description: string;
  brand?: string | null;
  itemCategory?: string | null;
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
  /** 拒绝原因(自动拒绝或后台拒绝),买手端直接展示 */
  rejectReason: string | null;
  reservationId: string | null;
  imageQuality?: number | null;
  fraudFlags?: Record<string, unknown> | null;
  // 客户确认返点金额
  confirmedAt?: string | null;
  disputedAt?: string | null;
  disputeCategory?: DisputeCategory | null;
  disputeReason?: string | null;
  disputeCount?: number;
  disputeResolutionNote?: string | null;
  ocrCompletedAt?: string | null;
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

  /** 客户确认返点金额无误 → CONFIRMED(金额锁定) */
  confirmCashback: (token: string, invoiceId: string) =>
    request<Invoice>(`/invoices/${invoiceId}/confirm-cashback`, { method: 'POST', token }),

  /** 客户对返点金额提出异议 → DISPUTED */
  disputeCashback: (token: string, invoiceId: string, data: { category: DisputeCategory; note: string }) =>
    request<Invoice>(`/invoices/${invoiceId}/dispute-cashback`, { method: 'POST', body: data, token }),
};

// ─── Reservations (预约购物) ──────────────────────────────────────────────────

export type ReservationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export type MerchantOption = { id: string; name: string };

export type Reservation = {
  id: string;
  merchantId: string;
  merchant: { id: string; name: string };
  /** UTC ISO;按 Europe/Paris 解释,精度到天 */
  startAt: string;
  endAt: string;
  status: ReservationStatus;
  reviewedAt: string | null;
  rejectNote: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

export type CreateReservationPayload = {
  merchantId: string;
  /** 巴黎日期 YYYY-MM-DD */
  startDate: string;
  endDate: string;
};

export const reservationApi = {
  merchants: (token: string) => request<MerchantOption[]>('/reservations/merchants', { token }),

  list: (token: string) => request<Reservation[]>('/reservations', { token }),

  create: (token: string, data: CreateReservationPayload) =>
    request<Reservation>('/reservations', { method: 'POST', body: data, token }),

  cancel: (token: string, id: string) =>
    request<Reservation>(`/reservations/${id}/cancel`, { method: 'POST', token }),
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

export const SETTLEMENT_METHOD_LABEL: Record<SettlementMethod, string> = {
  BANK_TRANSFER: '银行卡打款',
  VOUCHER: '代金券',
  GIFT_CARD: '礼品券',
};

/** 结算状态文案随方式不同:银行卡是"打款",代金券/礼品券是"发放" */
const BANK_STATUS_LABEL: Record<SettlementStatus, string> = {
  CONFIRMED: '已确认（打款未发送）',
  SENT: '打款处理中',
  PAID: '已到账',
  FAILED: '打款失败',
};
const ISSUE_STATUS_LABEL: Record<SettlementStatus, string> = {
  CONFIRMED: '待发放',
  SENT: '发放中',
  PAID: '已发放',
  FAILED: '发放失败',
};
export function settlementStatusLabel(s: { method: SettlementMethod; status: SettlementStatus }): string {
  return (s.method === 'BANK_TRANSFER' ? BANK_STATUS_LABEL : ISSUE_STATUS_LABEL)[s.status];
}

export type Settlement = {
  id: string;
  invoiceId: string;
  amount: string;
  method: SettlementMethod;
  status: SettlementStatus;
  bankAccountName: string | null;
  bankName: string | null;
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
  bankName?: string;
  bankIban?: string;
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

export type AdminInvoiceSettlement = {
  id: string;
  method: SettlementMethod;
  status: SettlementStatus;
  amount: string;
  bankAccountName: string | null;
  bankName: string | null;
  bankIban: string | null;
  confirmedAt: string;
  paidAt: string | null;
};

export type AdminInvoice = Invoice & {
  user: { id: string; firstName: string; lastName: string; email: string };
  matchedMerchant: { id: string; name: string; taxId: string } | null;
  reservation: { id: string; startAt: string; endAt: string; status: ReservationStatus } | null;
  /** 客户选择的结算方式;未选择时为 null */
  settlement: AdminInvoiceSettlement | null;
};

export type AdminReservation = Reservation & {
  merchant: { id: string; name: string; taxId: string };
  user: { id: string; firstName: string; lastName: string; email: string };
  _count: { invoices: number };
};

export type AdminMerchant = {
  id: string;
  taxId: string;
  name: string;
  active: boolean;
  createdAt: string;
  _count: { reservations: number };
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
    data: {
      vendorName?: string;
      purchaseDate?: string;
      grandTotalAmount?: string;
      lineItems?: { description: string; brand?: string | null; itemCategory?: string | null; quantity?: number; amount_ttc: number }[];
    },
  ) =>
    request<Invoice>(`/invoices/${invoiceId}/correct`, {
      method: 'PATCH',
      body: data,
      token,
    }),

  /** 后台复核金额异议:按当前识别数据重算返点,重新置为待客户确认 */
  resolveDispute: (token: string, invoiceId: string, note: string) =>
    request<Invoice>(`/invoices/${invoiceId}/resolve-dispute`, { method: 'POST', body: { note }, token }),

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

  // ─── 预约审核 ───
  listReservations: (token: string, params?: { status?: ReservationStatus | ''; page?: number }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.page) qs.set('page', String(params.page));
    return request<{ items: AdminReservation[]; total: number; page: number; limit: number }>(
      `/admin/reservations?${qs}`,
      { token },
    );
  },

  acceptReservation: (token: string, id: string) =>
    request<Reservation>(`/admin/reservations/${id}/accept`, { method: 'POST', token }),

  rejectReservation: (token: string, id: string, note: string) =>
    request<Reservation>(`/admin/reservations/${id}/reject`, { method: 'POST', body: { note }, token }),

  // ─── 商家管理 ───
  listMerchants: (token: string) => request<AdminMerchant[]>('/admin/merchants', { token }),

  createMerchant: (token: string, data: { name: string; taxId: string }) =>
    request<AdminMerchant>('/admin/merchants', { method: 'POST', body: data, token }),

  updateMerchant: (
    token: string,
    id: string,
    data: { name?: string; taxId?: string; active?: boolean },
  ) => request<AdminMerchant>(`/admin/merchants/${id}`, { method: 'PATCH', body: data, token }),
};

// ─── 日期展示(巴黎时区) ─────────────────────────────────────────────────────

/** 把 UTC ISO 字符串按 Europe/Paris 显示成 YYYY-MM-DD */
export function formatParisDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** 巴黎的今天 YYYY-MM-DD */
export function todayInParis(): string {
  return formatParisDate(new Date().toISOString());
}
