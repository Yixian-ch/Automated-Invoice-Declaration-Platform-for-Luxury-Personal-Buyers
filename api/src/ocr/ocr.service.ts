import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mistral } from '@mistralai/mistralai'; // ✅ Mistral SDK
import { findSiretsInText, normalizeSiret } from '../reservation/siret';
import { normalizeUnitScore } from '../auto-review/auto-review.rules';
import { parseModelJson } from './json-repair';

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
  merchantTaxId?: string;    // 商家 SIRET(14 位),印在 COMMERÇANT 地址下方;用于预约匹配
  imageQuality?: number;     // 模型自评图片清晰度/可读性 0–1;自动审核规则 1 用
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
// cerfa 表单编号(所有退税单都一样,不是发票号),例如 "N° 15021*04"
const CERFA_FORM_NO_RE = /^\s*(?:N\s*[°ºo]?\s*)?\d{5}\s*\*\s*\d{2}\s*$/i;
// 条形码下方的交易号:18–22 位连续数字(条形码号是连印的,不允许空格,
// 否则会把相邻的税号+邮编之类拼成一串)
const BARCODE_NUMBER_RE = /(?<!\d)\d{18,22}(?!\d)/g;

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
- invoiceNumber (string or null — the unique transaction number of this receipt. On French tax-free forms (Bordereau de vente à l'exportation / BVE) it is the LONG numeric string printed directly BELOW the barcode in the top-right corner, about 20 digits, e.g. "25020582499619654442". Return digits only. Do NOT return the cerfa form number such as "N° 15021*04" — that is a form template number shared by every receipt, not the transaction number. On ordinary invoices use the number printed after "N°", "Facture", "Ticket" or "Invoice". null if no such number is present)
- merchantTaxId (string or null — the merchant's French SIRET: a 14-digit number printed just below the merchant's postal address in the "COMMERÇANT" / merchant block, e.g. "53775858300059". Digits only, no spaces. Do NOT confuse it with the tax-free operator's number in the "OPERATEUR DE DETAXE" block. null if not present)
- purchaseDate (string format YYYY-MM-DD — on BVE forms use "Date d'émission du BVE")
- imageQuality (number between 0 and 1 — your honest assessment of how legible the photo is: 1.0 = sharp, evenly lit, fully in frame, every digit unambiguous; 0.8 = readable with minor blur/glare; below 0.8 = parts are blurry, cut off, too dark, or digits could be misread; below 0.5 = mostly unreadable. Be strict: if you had to guess any digit of the barcode number, SIRET, date or total, score below 0.8)
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
        // 明细多的小票 JSON 会较长;给足输出长度,避免在半截被截断
        maxTokens: 4096,
      });

      const responseText = response.choices?.[0]?.message?.content;
      if (!responseText || typeof responseText !== 'string') {
        throw new Error('Empty or invalid text response from Mistral API');
      }

      const { value: cleanedJson, repaired } = parseModelJson(responseText);
      if (repaired) {
        this.logger.warn(
          `[OcrService] Model JSON was truncated/malformed — repaired, salvaged keys: ${Object.keys(cleanedJson).join(',')}`,
        );
      }
      const rawText = responseText; 
      const fallbackFlags = this._fallbackRegexOcr(rawText);

      return this._mapToOcrResult(cleanedJson, fallbackFlags, rawText, repaired);
    } catch (error) {
      this.logger.error(`Mistral OCR collection failed: ${String(error)}`);
      if (error instanceof Error) this.logger.error(error.stack);
      throw error;
    }
  }

  // ─── 内部辅助清洗与映射函数 (保持原样) ────────────────────────

  private _fallbackRegexOcr(text: string): { isBve: boolean; hasMerchantHeader: boolean } {
    return {
      isBve: BVE_MARKER_RE.test(text),
      hasMerchantHeader: BVE_MERCHANT_HDR_RE.test(text),
    };
  }

  /**
   * 发票号兜底:模型若仍返回 cerfa 表单编号("N° 15021*04")或没返回,
   * 就从返回文本里找一段 18–22 位的连续数字(条形码下方的交易号)。
   */
  private _resolveInvoiceNumber(raw: string | undefined | null, rawText: string): string | undefined {
    const value = raw ? String(raw).trim() : '';
    if (value && !CERFA_FORM_NO_RE.test(value)) {
      // 模型给的是纯数字串时去掉空格
      return /^[\d\s]+$/.test(value) ? value.replace(/\s+/g, '') : value;
    }
    const candidates = (rawText.match(BARCODE_NUMBER_RE) ?? []).map((m) => m.replace(/[ \t]/g, ''));
    return candidates[0] ?? undefined;
  }

  /**
   * SIRET 兜底:模型返回的税号校验不过时,从返回文本里找 Luhn 通过的 14 位数字。
   * 找不到就原样返回模型的值(交给下游按"照片不清晰"处理)。
   */
  private _resolveMerchantTaxId(raw: string | undefined | null, rawText: string): string | undefined {
    const direct = normalizeSiret(raw);
    if (direct) return direct;
    const found = findSiretsInText(rawText);
    if (found.length > 0) return found[0];
    return raw ? String(raw).trim() : undefined;
  }

  /** 模型返回的图片质量分:接受 0–1 或 0–100,其他 → undefined(不单独否决) */
  private _parseImageQuality(raw: unknown): number | undefined {
    const v = normalizeUnitScore(raw);
    return v === null ? undefined : parseFloat(v.toFixed(3));
  }

  private _computeConfidence(raw: Record<string, any>): number {
    // Score based on how many of the three required fields were extracted.
    // Each missing field costs ~0.13 points from a 0.90 ceiling.
    const required = [raw.merchantName, raw.purchaseDate, raw.grandTotalAmount];
    const presentCount = required.filter(Boolean).length;
    let score = 0.50 + (presentCount / required.length) * 0.40; // 0.50 → 0.90

    if (raw.arithmeticCheck === 'fail') score -= 0.15;
    if (raw.needsReview === true) score -= 0.05;

    return parseFloat(Math.max(0, Math.min(1, score)).toFixed(2));
  }

  private _mapToOcrResult(raw: Record<string, any>, fallbacks: any, rawText: string, repairedFlag = false): OcrResult {
    const merchantName = raw.merchantName || null;
    const confidence = this._computeConfidence(raw);
    // 兜底扫描整个响应文本(不再让模型转写全文:太长会把 JSON 撑断)
    const receiptText = rawText;
    const invoiceNumber = this._resolveInvoiceNumber(raw.invoiceNumber, receiptText);
    const merchantTaxId = this._resolveMerchantTaxId(raw.merchantTaxId, receiptText);
    const imageQuality = this._parseImageQuality(raw.imageQuality);
    return {
      imageQuality,
      merchantName,
      merchantNameConfidence: raw.merchantName ? 0.90 : 0.0,
      purchaseDate: raw.purchaseDate ? new Date(raw.purchaseDate) : undefined,
      purchaseDateConfidence: raw.purchaseDate ? 0.90 : 0.0,
      grandTotalAmount: raw.grandTotalAmount ? parseFloat(raw.grandTotalAmount) : undefined,
      grandTotalAmountConfidence: raw.grandTotalAmount ? 0.90 : 0.0,
      taxRefundAmount: raw.taxRefundAmount ? parseFloat(raw.taxRefundAmount) : undefined,
      merchantTaxId,
      invoiceNumber,
      buyerName: raw.buyerName || null,
      lineItems: (raw.lineItems || []).map((item: any) => ({
        description: item.description || 'Unknown Item',
        brand: item.brand || null,
        itemCategory: item.itemCategory || null,
        quantity: item.quantity ? parseInt(item.quantity, 10) : 1,
        amount_ttc: item.amount_ttc ? parseFloat(item.amount_ttc) : 0,
        confidence,
      })),
      arithmeticCheck: raw.arithmeticCheck || 'pass',
      needsReview: raw.needsReview ?? false,
      reviewReasons: raw.reviewReasons || [],
      vendorName: merchantName,
      confidence,
      rawJson: {
        merchant_name: raw.merchantName,
        invoice_number: invoiceNumber,
        invoice_number_model: raw.invoiceNumber,
        merchant_tax_id: merchantTaxId,
        merchant_tax_id_model: raw.merchantTaxId,
        image_quality: imageQuality,
        purchase_date: raw.purchaseDate,
        grand_total_amount: raw.grandTotalAmount,
        tax_refund_amount: raw.taxRefundAmount,
        buyer_name: raw.buyerName,
        line_items: raw.lineItems,
        arithmetic_check: raw.arithmeticCheck,
        needs_review: raw.needsReview,
        review_reasons: raw.reviewReasons,
        confidence,
        json_repaired: repairedFlag,
        raw_text: rawText,
      },
    };
  }

  private _mockResult(): OcrResult {
    return {
      merchantName: 'LA SAMARITAINE',
      merchantNameConfidence: 0.95,
      invoiceNumber: '25020582499619654442',
      merchantTaxId: '53775858300059',
      imageQuality: 0.95,
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