import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OcrLineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
}

export interface OcrResult {
  invoiceNumber?: string;
  purchaseDate?: Date;
  vendorName?: string;
  vendorAddress?: string;
  brandName?: string;
  itemDescription?: string;
  currency?: string;
  subtotalAmount?: number;
  taxAmount?: number;
  grandTotalAmount?: number;
  confidence: number; // 0.0 – 1.0
  rawJson: Record<string, unknown>;
}

/** Shape returned by the Python OCR microservice */
interface OcrServiceResponse {
  invoice_number?: string;
  purchase_date?: string;
  vendor_name?: string;
  vendor_address?: string;
  brand_name?: string;
  item_description?: string;
  currency?: string;
  subtotal_amount?: number;
  tax_amount?: number;
  grand_total_amount?: number;
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
        signal: AbortSignal.timeout(120_000), // 2 min timeout for large PDFs
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`OCR service responded ${res.status}: ${text}`);
      }

      const data = await res.json() as OcrServiceResponse;
      return this._mapResponse(data);
    } catch (err) {
      this.logger.error('OCR microservice call failed', err);
      return { confidence: 0, rawJson: { error: String(err) } };
    }
  }

  private _mapResponse(data: OcrServiceResponse): OcrResult {
    let purchaseDate: Date | undefined;
    if (data.purchase_date) {
      const parsed = new Date(data.purchase_date);
      if (!isNaN(parsed.getTime())) purchaseDate = parsed;
    }

    return {
      invoiceNumber: data.invoice_number,
      purchaseDate,
      vendorName: data.vendor_name,
      vendorAddress: data.vendor_address,
      brandName: data.brand_name,
      itemDescription: data.item_description,
      currency: data.currency,
      subtotalAmount: data.subtotal_amount,
      taxAmount: data.tax_amount,
      grandTotalAmount: data.grand_total_amount,
      confidence: data.confidence,
      rawJson: data as unknown as Record<string, unknown>,
    };
  }

  private _mockResult(): OcrResult {
    return {
      invoiceNumber: `INV-DEV-${Date.now()}`,
      purchaseDate: new Date(),
      vendorName: 'Louis Vuitton Paris — Champs-Élysées',
      vendorAddress: '101 Avenue des Champs-Élysées, 75008 Paris',
      brandName: 'Louis Vuitton',
      itemDescription: 'Sac Neverfull MM Monogram Canvas',
      currency: 'EUR',
      subtotalAmount: 1450.0,
      taxAmount: 181.25,
      grandTotalAmount: 1631.25,
      confidence: 0.97,
      rawJson: { mode: 'bypass', note: 'Set BYPASS_OCR=false to use real PaddleOCR' },
    };
  }
}


export interface OcrLineItem {
  description: string;
  quantity?: number;
  unitPrice?: number;
  totalPrice?: number;
}

export interface OcrResult {
  invoiceNumber?: string;
  purchaseDate?: Date;
  vendorName?: string;
  vendorAddress?: string;
  brandName?: string;
  itemDescription?: string;
  currency?: string;
  subtotalAmount?: number;
  taxAmount?: number;
  grandTotalAmount?: number;
  confidence: number; // 0.0 – 1.0
  rawJson: Record<string, unknown>;
}

