import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mistral } from '@mistralai/mistralai'; // ✅ Mistral SDK

export interface OcrLineItem {
  description: string;
  brand?: string | null;
  itemCategory?: string | null;
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
  taxRefundAmount?: number;  // Montant de la détaxe (BVE receipts)
  // Non-core fields
  buyerName?: string;
  lineItems: OcrLineItem[];
  // Validation
  arithmeticCheck?: string; // "pass" | "fail"
  needsReview: boolean;
  reviewReasons: string[];
  // Legacy / general invoice fields kept for backwards compat
  vendorName?: string;       // alias: same value as merchantName
  vendorAddress?: string;
  brandName?: string;
  currency?: string;
  invoiceNumber?: string;
  itemDescription?: string;
  subtotalAmount?: number;
  taxAmount?: number;
  // Overall
  confidence: number;
  rawJson: Record<string, unknown>;
}

// ─── 正则兜底匹配规则 (保持原样) ────────────────────────
const BVE_MARKER_RE = /bordereau\s+de\\s+vente|BVE|d[eé]taxe|vente\\s+[àa]\\s+l.export/i;
const BVE_MERCHANT_HDR_RE = /COMMER[CÇ]ANT|REPRESENT[EÉ]|VENDOR|MERCHANT/i;

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly mistral: Mistral;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('MISTRAL_API_KEY') || '';
    this.mistral = new Mistral({ apiKey });
  }

  /**
   * 使用 Mistral Vision API 提取发票核心数据
   */
  async processDocument(buffer: Buffer, mimeType: string): Promise<OcrResult> {
    const bypassOcr = this.config.get<string>('BYPASS_OCR') === 'true';
    if (bypassOcr) {
      this.logger.warn('[OcrService] [DEV] BYPASS_OCR active — returning mock OCR result');
      return this._mockResult();
    }

    this.logger.log(`[OcrService] Sending document to Mistral OCR API (${mimeType}, ${buffer.length} bytes)`);

    try {
      const base64Data = buffer.toString('base64');
      
      const systemPrompt = `You are an expert OCR and invoice extraction system.
Analyze the provided receipt/invoice image and extract data matching the requested schema.
You MUST output a single valid JSON object. Do not include markdown codeblocks, preambles, or postscript explanations.`;

      const userPrompt = `Please extract the following structural data from this invoice or receipt:
- merchantName (string, name of store e.g., CHANEL, LOUIS VUITTON, GALERIES LAFAYETTE)
- purchaseDate (string format YYYY-MM-DD)
- grandTotalAmount (float, the total amount including tax — "Montant total TTC")
- taxRefundAmount (float or null — the duty-free refund amount labelled "Montant de la détaxe" or "Montant de remboursement" on BVE/détaxe receipts; null if not present)
- buyerName (string, uppercase full name of the customer/tourist)
- lineItems (array of objects, one entry per product line):
    - description (string, the full product description as printed)
    - brand (string or null — the luxury brand of this specific item, e.g. "CHANEL", "DIOR", "LOUIS VUITTON"; infer from description if not explicitly labelled; null if unknown)
    - itemCategory (string or null — standardised product category; use one of: handbag, bag, shoes, watch, jewellery, clothing, perfume, cosmetics, accessories, luggage, sunglasses, other; null if unknown)
    - quantity (integer)
    - amount_ttc (float, the line total including tax)

Perform mathematical self-validation: if the sum of lineItems' amount_ttc does not equal grandTotalAmount, set "arithmeticCheck" to "fail" and flag "needsReview" as true with detailed "reviewReasons".`;

      // ✅ 调用 Mistral Chat Completion 
      const response = await this.mistral.chat.complete({
        model: 'pixtral-12b-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: userPrompt },
              {
                type: 'image_url',
                imageUrl: `data:${mimeType};base64,${base64Data}`, // 🔥 修正：由 image_url 改为 imageUrl
              },
            ],
          },
        ] as any, // 🛡️ 加强类型包容性，防止复杂的 SDK 联合类型引发 ts 编译阻塞
        responseFormat: { type: 'json_object' }, 
        temperature: 0.1,
      });

      const responseText = response.choices?.[0]?.message?.content;
      if (!responseText || typeof responseText !== 'string') {
        throw new Error('Empty or invalid text response from Mistral API');
      }

      const cleanedJson = this._cleanJsonResponse(responseText);
      const rawText = responseText; 
      const fallbackFlags = this._fallbackRegexOcr(rawText);

      return this._mapToOcrResult(cleanedJson, fallbackFlags, rawText);
    } catch (error) {
      this.logger.error(`Mistral OCR collection failed: ${String(error)}`);
      if (error instanceof Error) this.logger.error(error.stack);
      throw error;
    }
  }

  // ─── 内部辅助清洗与映射函数 (保持原样) ────────────────────────

  private _cleanJsonResponse(text: string): Record<string, any> {
    let clean = text.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
    }
    return JSON.parse(clean);
  }

  private _fallbackRegexOcr(text: string): { isBve: boolean; hasMerchantHeader: boolean } {
    return {
      isBve: BVE_MARKER_RE.test(text),
      hasMerchantHeader: BVE_MERCHANT_HDR_RE.test(text),
    };
  }

  private _mapToOcrResult(raw: Record<string, any>, fallbacks: any, rawText: string): OcrResult {
    const merchantName = raw.merchantName || null;
    return {
      merchantName,
      merchantNameConfidence: raw.merchantName ? 0.92 : 0.0,
      purchaseDate: raw.purchaseDate ? new Date(raw.purchaseDate) : undefined,
      purchaseDateConfidence: raw.purchaseDate ? 0.94 : 0.0,
      grandTotalAmount: raw.grandTotalAmount ? parseFloat(raw.grandTotalAmount) : undefined,
      grandTotalAmountConfidence: raw.grandTotalAmount ? 0.96 : 0.0,
      taxRefundAmount: raw.taxRefundAmount ? parseFloat(raw.taxRefundAmount) : undefined,
      buyerName: raw.buyerName || null,
      lineItems: (raw.lineItems || []).map((item: any) => ({
        description: item.description || 'Unknown Item',
        brand: item.brand || null,
        itemCategory: item.itemCategory || null,
        quantity: item.quantity ? parseInt(item.quantity, 10) : 1,
        amount_ttc: item.amount_ttc ? parseFloat(item.amount_ttc) : 0,
        confidence: 0.90,
      })),
      arithmeticCheck: raw.arithmeticCheck || 'pass',
      needsReview: raw.needsReview ?? false,
      reviewReasons: raw.reviewReasons || [],
      vendorName: merchantName,
      confidence: 0.93,
      rawJson: {
        merchant_name: raw.merchantName,
        purchase_date: raw.purchaseDate,
        grand_total_amount: raw.grandTotalAmount,
        tax_refund_amount: raw.taxRefundAmount,
        buyer_name: raw.buyerName,
        line_items: raw.lineItems,
        arithmetic_check: raw.arithmeticCheck,
        needs_review: raw.needsReview,
        review_reasons: raw.reviewReasons,
        confidence: 0.93,
        raw_text: rawText,
      },
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
        { description: 'PARFUM DIOR MISS DIOR 100ML', quantity: 1, amount_ttc: 134.0, confidence: 0.92 }
      ],
      arithmeticCheck: 'pass',
      needsReview: false,
      reviewReasons: [],
      vendorName: 'LA SAMARITAINE',
      confidence: 0.95,
      rawJson: { info: 'mocked' },
    };
  }
}