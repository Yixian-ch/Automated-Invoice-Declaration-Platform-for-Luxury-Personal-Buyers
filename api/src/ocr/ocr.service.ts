import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Anthropic } from '@anthropic-ai/sdk';

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

// ─── Regex patterns (ported from ocr-service/main.py) ────────────────────────

const BVE_MARKER_RE = /bordereau\s+de\s+vente|BVE|d[eé]taxe|vente\s+[àa]\s+l.export/i;
const BVE_MERCHANT_HDR_RE = /COMMER[CÇ]ANT/i;
const BVE_BUYER_HDR_RE = /ACHETEUR/i;
const BVE_ITEMS_HDR_RE = /MARCHANDISES/i;
const BVE_DATE_RE =
  /date\s+d[''´‘’][Ée]?mission\s+(?:du\s+)?BVE\s*[:\-]?\s*(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i;
const BVE_TOTAL_RE = /montant\s+total\s+TTC\s*[:\-]?\s*([\d\s]+[,.]\d{2})/i;
const DATE_RE =
  /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b/;
const TOTAL_LABEL_RE =
  /(grand\s*total|total\s*(?:ttc|ht|amount|due|general)|montant\s*total|total\s+g[eé]n[eé]ral|total)/i;
const AMOUNT_FR_RE = /\b([\d][\d\s]{0,9}[,]\d{2})\b/;
const AMOUNT_EN_RE = /\b([\d][\d\s]{0,9}[.]\d{2})\b/;
const SECTION_END_RE = /(ACHETEUR|COMMER[CÇ]ANT|TOTAL\s+TTC|montant\s+total)/i;
const HDR_ROW_RE =
  /(d[eé]signation|quantit[eé]|montant|taux|description|n[°o]\b|num[eé]ro|identification|marchandises|tva\b)/i;
const DESC_HDR_RE =
  /(num[eé]ro|d.identification|description\s+des|quantit[eé]|taux\s+tva|montant\s+tva|montant\s+ttc)/i;
const NON_PRODUCT_RE =
  /(date|mode de paiement|montant total|montant de la|cette somme|remboursement)/i;

// ─── Internal result shape ────────────────────────────────────────────────────

interface ExtractedField<T = string> {
  value?: T;
  confidence: number;
}

interface RawOcrResult {
  merchantName: ExtractedField<string>;
  purchaseDate: ExtractedField<string>;
  grandTotalAmount: ExtractedField<number>;
  buyerName: ExtractedField<string>;
  lineItems: OcrLineItem[];
  arithmeticCheck?: string;
  needsReview: boolean;
  reviewReasons: string[];
  confidence: number;
  rawText: string;
}

// ─── Amount parsing ───────────────────────────────────────────────────────────

function parseAmount(text: string): number | undefined {
  let m = AMOUNT_FR_RE.exec(text);
  if (m) {
    try { return parseFloat(m[1].replace(/\s/g, '').replace(',', '.')); } catch {}
  }
  m = AMOUNT_EN_RE.exec(text);
  if (m) {
    try { return parseFloat(m[1].replace(/\s/g, '')); } catch {}
  }
  return undefined;
}

// ─── BVE detection ────────────────────────────────────────────────────────────

function isBve(lines: string[]): boolean {
  return BVE_MARKER_RE.test(lines.slice(0, 30).join('\n'));
}

// ─── BVE-specialised extractor ────────────────────────────────────────────────

function extractBve(lines: string[]): RawOcrResult {
  const fullText = lines.join('\n');
  const reviewReasons: string[] = [];

  // ── merchant_name ──────────────────────────────────────────────────────────
  let merchantName: ExtractedField<string> = { confidence: 0 };
  for (let i = 0; i < lines.length; i++) {
    if (!BVE_MERCHANT_HDR_RE.test(lines[i])) continue;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      const candidate = lines[j].replace(/\|/g, '').trim();
      if (candidate.length >= 3 && !/^\d+/.test(candidate)) {
        const conf = /^[A-Z\sÀ-Ü]+$/.test(candidate) ? 0.9 : 0.78;
        merchantName = { value: candidate, confidence: conf };
        break;
      }
    }
    break;
  }
  if (!merchantName.value) {
    const known: [string, string][] = [
      ['samaritaine', 'LA SAMARITAINE'],
      ['galerieslafayette', 'GALERIES LAFAYETTE'],
      ['lafayette', 'GALERIES LAFAYETTE'],
      ['louisvuitton', 'LOUIS VUITTON'],
      ['louis-vuitton', 'LOUIS VUITTON'],
      ['dior.com', 'CHRISTIAN DIOR'],
      ['chanel.com', 'CHANEL'],
      ['hermes.com', 'HERMÈS'],
      ['printemps', 'PRINTEMPS'],
    ];
    outer: for (const line of lines) {
      const lower = line.toLowerCase();
      for (const [kw, name] of known) {
        if (lower.includes(kw)) { merchantName = { value: name, confidence: 0.72 }; break outer; }
      }
    }
  }

  // ── purchase_date ──────────────────────────────────────────────────────────
  let purchaseDate: ExtractedField<string> = { confidence: 0 };
  const dateM = BVE_DATE_RE.exec(fullText);
  if (dateM) {
    purchaseDate = { value: dateM[1], confidence: 0.9 };
  } else {
    for (const line of lines) {
      if (!/\bdate\b/i.test(line)) continue;
      const dm = DATE_RE.exec(line);
      if (dm) { purchaseDate = { value: dm[1], confidence: 0.65 }; break; }
    }
    if (!purchaseDate.value) {
      const dm = DATE_RE.exec(fullText);
      if (dm) purchaseDate = { value: dm[1], confidence: 0.5 };
    }
  }

  // ── grand_total_amount ─────────────────────────────────────────────────────
  let grandTotal: ExtractedField<number> = { confidence: 0 };
  const totalM = BVE_TOTAL_RE.exec(fullText);
  if (totalM) {
    const amt = parseAmount(totalM[1]);
    if (amt !== undefined) grandTotal = { value: amt, confidence: 0.9 };
  }
  if (grandTotal.value === undefined) {
    for (let i = 0; i < lines.length; i++) {
      if (!TOTAL_LABEL_RE.test(lines[i])) continue;
      const combined = lines[i] + (i + 1 < lines.length ? ' ' + lines[i + 1] : '');
      const amt = parseAmount(combined);
      if (amt !== undefined) { grandTotal = { value: amt, confidence: 0.7 }; break; }
    }
  }

  // ── buyer_name ─────────────────────────────────────────────────────────────
  let buyerName: ExtractedField<string> = { confidence: 0 };
  for (let i = 0; i < lines.length; i++) {
    if (!BVE_BUYER_HDR_RE.test(lines[i])) continue;
    let nom: string | undefined;
    let prenom: string | undefined;
    for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
      const chunk = lines[j].replace(/\|/g, '').trim();
      const nmM = /[Nn]om\s*[:\-]?\s*(.+)/.exec(chunk);
      const pmM = /[Pp]r[eé]nom\s*[:\-]?\s*(.+)/.exec(chunk);
      if (nmM) nom = nmM[1].trim();
      if (pmM) prenom = pmM[1].trim();
      if (!nmM && !pmM && /^[A-ZÀ-Ü]{2,}/.test(chunk)) nom = chunk;
    }
    if (nom || prenom) {
      const parts = [prenom, nom].filter(Boolean).join(' ');
      buyerName = { value: parts || undefined, confidence: 0.9 };
    }
    break;
  }

  // ── line_items ─────────────────────────────────────────────────────────────
  const lineItems: OcrLineItem[] = [];
  let inTable = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (BVE_ITEMS_HDR_RE.test(line)) { inTable = true; continue; }
    if (!inTable) continue;
    if (SECTION_END_RE.test(line)) break;
    if (HDR_ROW_RE.test(line)) continue;
    // Markdown table separator row
    if (/^\|[-\s|:]+\|$/.test(line)) continue;

    let description: string | undefined;
    let qty: number | undefined;
    let amtTtc: number | undefined;

    if (line.includes('|')) {
      // Markdown table row — split by pipe
      const cells = line.split('|').map(c => c.trim()).filter(Boolean);
      for (const cell of cells) {
        if (!description && /[A-Za-zÀ-ÿ]{2,}/.test(cell) && !DESC_HDR_RE.test(cell) && !NON_PRODUCT_RE.test(cell)) {
          description = cell;
        }
        // Keep the last parseable amount (rightmost column = Montant TTC)
        const amt = parseAmount(cell);
        if (amt !== undefined) amtTtc = amt;
        // Quantity: small integer cell
        if (!qty) {
          const qm = /^(\d+(?:[,.]\d+)?)$/.exec(cell);
          if (qm) {
            const v = parseFloat(qm[1].replace(',', '.'));
            if (v <= 10) qty = v;
          }
        }
      }
    } else {
      // Plain text line
      if (!/[A-Za-zÀ-ÿ]{3,}/.test(line)) continue;
      if (DESC_HDR_RE.test(line) || NON_PRODUCT_RE.test(line)) continue;
      description = line.replace(/[\d\s,.:€]+$/, '').trim();
      if (description.length < 3) continue;
      amtTtc = parseAmount(line);
      const qm = /\b([1-9]\d?)\b/.exec(line);
      if (qm) { const v = parseFloat(qm[1]); if (v <= 10) qty = v; }
    }

    if (!description || description.length < 3) continue;
    if (DESC_HDR_RE.test(description) || NON_PRODUCT_RE.test(description)) continue;

    lineItems.push({
      description,
      quantity: qty ?? 1,
      amount_ttc: amtTtc,
      confidence: amtTtc !== undefined ? 0.9 : 0.55,
    });
  }

  // ── arithmetic_check ───────────────────────────────────────────────────────
  let arithmeticCheck: string | undefined;
  if (lineItems.length > 0 && grandTotal.value !== undefined) {
    const withAmt = lineItems.filter(li => li.amount_ttc !== undefined);
    if (withAmt.length > 0) {
      const sum = withAmt.reduce((acc, li) => acc + (li.amount_ttc ?? 0), 0);
      arithmeticCheck = Math.abs(sum - grandTotal.value) < 0.01 ? 'pass' : 'fail';
    }
  }

  // ── needs_review ──────────────────────────────────────────────────────────
  const CORE_THRESHOLD = 0.6;
  if (merchantName.confidence < CORE_THRESHOLD)
    reviewReasons.push(`merchant_name confidence too low (${merchantName.confidence.toFixed(2)})`);
  if (purchaseDate.confidence < CORE_THRESHOLD)
    reviewReasons.push(`purchase_date confidence too low (${purchaseDate.confidence.toFixed(2)})`);
  if (grandTotal.confidence < CORE_THRESHOLD)
    reviewReasons.push(`grand_total_amount confidence too low (${grandTotal.confidence.toFixed(2)})`);
  if (arithmeticCheck === 'fail')
    reviewReasons.push('arithmetic check failed: line items sum ≠ grand total');

  const overall = (merchantName.confidence + purchaseDate.confidence + grandTotal.confidence) / 3;

  return {
    merchantName,
    purchaseDate,
    grandTotalAmount: grandTotal,
    buyerName,
    lineItems,
    arithmeticCheck,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    confidence: Math.round(overall * 10000) / 10000,
    rawText: fullText,
  };
}

// ─── Generic fallback extractor ───────────────────────────────────────────────

function extractGeneric(lines: string[]): RawOcrResult {
  const fullText = lines.join('\n');
  const reviewReasons: string[] = [];

  let merchantVal: string | undefined;
  let merchantConf = 0.5;
  const known: [string, string][] = [
    ['galerieslafayette', 'Galeries Lafayette'],
    ['lafayette', 'Galeries Lafayette'],
    ['louisvuitton', 'Louis Vuitton'],
    ['louis-vuitton', 'Louis Vuitton'],
    ['dior.com', 'Dior'],
    ['chanel.com', 'Chanel'],
    ['hermes.com', 'Hermès'],
    ['printemps', 'Printemps'],
  ];
  outer: for (const line of lines) {
    const lower = line.toLowerCase();
    for (const [kw, name] of known) {
      if (lower.includes(kw)) { merchantVal = name; merchantConf = 0.8; break outer; }
    }
  }
  if (!merchantVal) {
    const candidates = lines.slice(0, 8).filter(l => l.length > 3);
    if (candidates.length > 0) { merchantVal = candidates[0]; merchantConf = 0.5; }
  }

  let dateVal: string | undefined;
  let dateConf = 0;
  const dm = DATE_RE.exec(fullText);
  if (dm) { dateVal = dm[1]; dateConf = 0.6; }

  let totalVal: number | undefined;
  let totalConf = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!TOTAL_LABEL_RE.test(lines[i])) continue;
    const combined = lines[i] + (i + 1 < lines.length ? ' ' + lines[i + 1] : '');
    const amt = parseAmount(combined);
    if (amt !== undefined) { totalVal = amt; totalConf = 0.7; break; }
  }
  if (totalVal === undefined) {
    const allAmts = lines
      .map(l => parseAmount(l))
      .filter((a): a is number => a !== undefined && a > 0)
      .sort((a, b) => b - a);
    if (allAmts.length > 0) { totalVal = allAmts[0]; totalConf = 0.45; }
  }

  const CORE_THRESHOLD = 0.6;
  if (merchantConf < CORE_THRESHOLD)
    reviewReasons.push(`merchant_name confidence too low (${merchantConf.toFixed(2)})`);
  if (dateConf < CORE_THRESHOLD)
    reviewReasons.push(`purchase_date confidence too low (${dateConf.toFixed(2)})`);
  if (totalConf < CORE_THRESHOLD)
    reviewReasons.push(`grand_total_amount confidence too low (${totalConf.toFixed(2)})`);

  const overall = (merchantConf + dateConf + totalConf) / 3;

  return {
    merchantName: { value: merchantVal, confidence: merchantConf },
    purchaseDate: { value: dateVal, confidence: dateConf },
    grandTotalAmount: { value: totalVal, confidence: totalConf },
    buyerName: { confidence: 0 },
    lineItems: [],
    arithmeticCheck: undefined,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    confidence: Math.round(overall * 10000) / 10000,
    rawText: fullText,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly anthropic: Anthropic;
  private readonly bypassOcr: boolean;

  constructor(private readonly config: ConfigService) {
    this.anthropic = new Anthropic({
      apiKey: config.get<string>('Claude_OCR_API', ''),
    });
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
      const base64 = content.toString('base64');
      const isPdf = mimeType.toLowerCase().includes('pdf');

      const mediaSource = { type: 'base64', media_type: mimeType, data: base64 };
      const contentBlock = isPdf
        ? { type: 'document', source: mediaSource }
        : { type: 'image', source: mediaSource };

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            contentBlock as any,
            {
              type: 'text' as const,
              text: 'Please extract all text from this document. Return only the raw text, preserving the layout as much as possible.',
            },
          ],
        }],
      });

      const text: string = response.content
        .filter(b => b.type === 'text')
        .map(b => (b as any).text)
        .join('\n');

      const lines = text
        .split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0);

      const raw = isBve(lines) ? extractBve(lines) : extractGeneric(lines);
      return this._mapRawResult(raw);
    } catch (err) {
      this.logger.error('Claude OCR call failed: ' + String(err));
      if (err instanceof Error) {
        this.logger.error('Stack: ' + err.stack);
      }
      throw err;
    }
  }

  private _mapRawResult(raw: RawOcrResult): OcrResult {
    let purchaseDate: Date | undefined;
    if (raw.purchaseDate.value) {
      // BVE dates arrive as DD/MM/YYYY — normalise to ISO before parsing
      const normalised = raw.purchaseDate.value.replace(
        /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/,
        (_, d, m, y) => {
          const year = y.length === 2 ? `20${y}` : y;
          return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        },
      );
      const parsed = new Date(normalised);
      if (!isNaN(parsed.getTime())) purchaseDate = parsed;
    }

    const merchantName = raw.merchantName.value;
    return {
      merchantName,
      merchantNameConfidence: raw.merchantName.confidence,
      purchaseDate,
      purchaseDateConfidence: raw.purchaseDate.confidence,
      grandTotalAmount: raw.grandTotalAmount.value,
      grandTotalAmountConfidence: raw.grandTotalAmount.confidence,
      buyerName: raw.buyerName.value,
      lineItems: raw.lineItems,
      arithmeticCheck: raw.arithmeticCheck,
      needsReview: raw.needsReview,
      reviewReasons: raw.reviewReasons,
      vendorName: merchantName,
      confidence: raw.confidence,
      rawJson: {
        merchant_name: raw.merchantName,
        purchase_date: raw.purchaseDate,
        grand_total_amount: raw.grandTotalAmount,
        buyer_name: raw.buyerName,
        line_items: raw.lineItems,
        arithmetic_check: raw.arithmeticCheck,
        needs_review: raw.needsReview,
        review_reasons: raw.reviewReasons,
        confidence: raw.confidence,
        raw_text: raw.rawText,
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
        { description: 'PARFUM DIOR MISS DIOR 100ML', quantity: 1, amount_ttc: 134.0, confidence: 0.85 },
      ],
      arithmeticCheck: 'fail',
      needsReview: false,
      reviewReasons: [],
      vendorName: 'LA SAMARITAINE',
      brandName: 'Christian Dior',
      currency: 'EUR',
      confidence: 0.95,
      rawJson: { mode: 'bypass', note: 'Set BYPASS_OCR=false to use real Mistral OCR' },
    };
  }
}
