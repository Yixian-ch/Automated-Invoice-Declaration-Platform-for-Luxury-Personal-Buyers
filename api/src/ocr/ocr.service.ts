import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OcrLineItem {
  description: string;
  quantity?: number;
  amount_ttc?: number;
  confidence: number;
}

export interface OcrResult {
  // Core fields
  merchantName?: string;
  merchantNameConfidence: number;
  purchaseDate?: Date;
  purchaseDateConfidence: number;
  grandTotalAmount?: number;
  grandTotalAmountConfidence: number;
  // Non-core fields
  buyerName?: string;
  lineItems: OcrLineItem[];
  // Validation
  arithmeticCheck?: string; // "pass" | "fail"
  needsReview: boolean;
  reviewReasons: string[];
  // Legacy / general invoice fields kept for backwards compat
  vendorName?: string;       // alias: same value as merchantName
  brandName?: string;
  currency?: string;
  // Overall
  confidence: number;
  rawJson: Record<string, unknown>;
}

/** Shape returned by the Python OCR microservice */
interface ExtractedFieldRaw {
  value: unknown;
  confidence: number;
}
interface LineItemRaw {
  description: string;
  quantity?: number;
  amount_ttc?: number;
  confidence: number;
}
interface OcrServiceResponse {
  merchant_name?: ExtractedFieldRaw;
  purchase_date?: ExtractedFieldRaw;
  grand_total_amount?: ExtractedFieldRaw;
  buyer_name?: ExtractedFieldRaw;
  line_items?: LineItemRaw[];
  arithmetic_check?: string;
  needs_review?: boolean;
  review_reasons?: string[];
  confidence: number;
  raw_text: string;
}

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly serviceUrl: string;
  private readonly bypassOcr: boolean;

  constructor(private readonly config: ConfigService) {
    this.serviceUrl = config.get<string>('OCR_SERVICE_URL', 'http://localhost:8000');
    this.bypassOcr =
      config.get<string>('NODE_ENV') !== 'production' &&
      config.get<string>('BYPASS_OCR') === 'true';
  }

  async processDocument(content: Buffer, mimeType: string): Promise<OcrResult> {
    if (this.bypassOcr) {
      this.logger.warn('[DEV] BYPASS_OCR active — returning mock OCR result');
      return this._mockResult();
    }

    try {
      const body = JSON.stringify({
        content: content.toString('base64'),
        mime_type: mimeType,
      });

      const res = await fetch(`${this.serviceUrl}/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(120_000),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OCR service responded ${res.status}: ${text}`);
      }

      const data = (await res.json()) as OcrServiceResponse;
      return this._mapResponse(data);
    } catch (err) {
      this.logger.error('OCR microservice call failed', err);
      return {
        merchantNameConfidence: 0,
        purchaseDateConfidence: 0,
        grandTotalAmountConfidence: 0,
        lineItems: [],
        needsReview: true,
        reviewReasons: ['OCR service call failed'],
        confidence: 0,
        rawJson: { error: String(err) },
      };
    }
  }

  private _mapResponse(data: OcrServiceResponse): OcrResult {
    const merchantField = data.merchant_name;
    const dateField = data.purchase_date;
    const totalField = data.grand_total_amount;
    const buyerField = data.buyer_name;

    let purchaseDate: Date | undefined;
    const rawDate = dateField?.value;
    if (rawDate && typeof rawDate === 'string') {
      // BVE dates come as DD/MM/YYYY — normalise to ISO before parsing
      const normalised = rawDate.replace(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/, (_, d, m, y) => {
        const year = y.length === 2 ? `20${y}` : y;
        return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      });
      const parsed = new Date(normalised);
      if (!isNaN(parsed.getTime())) purchaseDate = parsed;
    }

    const merchantName =
      merchantField?.value != null ? String(merchantField.value) : undefined;
    const grandTotalAmount =
      totalField?.value != null ? Number(totalField.value) : undefined;
    const buyerName =
      buyerField?.value != null ? String(buyerField.value) : undefined;

    const lineItems: OcrLineItem[] = (data.line_items ?? []).map((li) => ({
      description: li.description,
      quantity: li.quantity,
      amount_ttc: li.amount_ttc,
      confidence: li.confidence,
    }));

    return {
      merchantName,
      merchantNameConfidence: merchantField?.confidence ?? 0,
      purchaseDate,
      purchaseDateConfidence: dateField?.confidence ?? 0,
      grandTotalAmount,
      grandTotalAmountConfidence: totalField?.confidence ?? 0,
      buyerName,
      lineItems,
      arithmeticCheck: data.arithmetic_check,
      needsReview: data.needs_review ?? false,
      reviewReasons: data.review_reasons ?? [],
      // Legacy alias kept so existing code that reads vendorName still works
      vendorName: merchantName,
      confidence: data.confidence,
      rawJson: data as unknown as Record<string, unknown>,
    };
  }

  private _mockResult(): OcrResult {
    return {
      merchantName: 'LA SAMARITAINE',
      merchantNameConfidence: 0.95,
      purchaseDate: new Date('2025-09-21'),
      purchaseDateConfidence: 0.91,
      grandTotalAmount: 10603.0,
      grandTotalAmountConfidence: 0.98,
      buyerName: 'MAI LIDA',
      lineItems: [
        { description: 'MOD-ACCESSOIRES CHRISTIAN DIOR', quantity: 2, amount_ttc: 1380.0, confidence: 0.88 },
        { description: 'PARFUM DIOR MISS DIOR 100ML', quantity: 1, amount_ttc: 134.0, confidence: 0.85 },
      ],
      arithmeticCheck: 'fail', // mock: items don't sum to 10603 intentionally
      needsReview: false,
      reviewReasons: [],
      vendorName: 'LA SAMARITAINE',
      brandName: 'Christian Dior',
      currency: 'EUR',
      confidence: 0.95,
      rawJson: { mode: 'bypass', note: 'Set BYPASS_OCR=false to use real PaddleOCR' },
    };
  }
}
