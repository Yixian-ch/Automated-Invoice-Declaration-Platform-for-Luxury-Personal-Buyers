import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

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

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly client: DocumentProcessorServiceClient;
  private readonly processorName: string;

  constructor(private readonly config: ConfigService) {
    const projectId = this.config.get<string>('GOOGLE_PROJECT_ID', '');
    const location = this.config.get<string>('GOOGLE_LOCATION', 'eu');
    const processorId = this.config.get<string>('GOOGLE_PROCESSOR_ID', '');

    // EU endpoint to keep data in-region (GDPR compliance)
    const apiEndpoint = `${location}-documentai.googleapis.com`;
    this.client = new DocumentProcessorServiceClient({ apiEndpoint });

    this.processorName =
      `projects/${projectId}/locations/${location}/processors/${processorId}`;
  }

  /**
   * Process a document buffer (PDF or image) through Google Document AI.
   * Returns structured fields extracted from the invoice.
   */
  async processDocument(
    content: Buffer,
    mimeType: string,
  ): Promise<OcrResult> {
    try {
      const [result] = await this.client.processDocument({
        name: this.processorName,
        rawDocument: {
          content: content.toString('base64'),
          mimeType,
        },
      });

      const document = result.document;
      if (!document) {
        throw new Error('No document in Document AI response');
      }

      const entities = document.entities ?? [];
      const rawJson = document as unknown as Record<string, unknown>;

      // Extract fields from entities
      const get = (type: string): string | undefined => {
        const entity = entities.find((e) => e.type === type);
        return entity?.mentionText?.trim() ?? undefined;
      };

      const getNum = (type: string): number | undefined => {
        const raw = get(type);
        if (!raw) return undefined;
        const num = parseFloat(raw.replace(/[^0-9.,]/g, '').replace(',', '.'));
        return isNaN(num) ? undefined : num;
      };

      // Calculate average confidence from entities
      const confidenceValues = entities
        .map((e) => e.confidence ?? 0)
        .filter((c) => c > 0);
      const confidence =
        confidenceValues.length > 0
          ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
          : 0;

      // Parse purchase date
      let purchaseDate: Date | undefined;
      const dateStr = get('invoice_date') ?? get('receipt_date') ?? get('purchase_date');
      if (dateStr) {
        const parsed = new Date(dateStr);
        if (!isNaN(parsed.getTime())) {
          purchaseDate = parsed;
        }
      }

      return {
        invoiceNumber: get('invoice_id') ?? get('receipt_number'),
        purchaseDate,
        vendorName: get('supplier_name') ?? get('vendor_name') ?? get('merchant_name'),
        vendorAddress: get('supplier_address') ?? get('vendor_address'),
        brandName: get('brand_name') ?? get('manufacturer'),
        itemDescription: get('line_item/description') ?? get('item_description'),
        currency: get('currency') ?? get('currency_code'),
        subtotalAmount: getNum('net_amount') ?? getNum('subtotal'),
        taxAmount: getNum('total_tax_amount') ?? getNum('tax_amount'),
        grandTotalAmount: getNum('total_amount') ?? getNum('grand_total'),
        confidence,
        rawJson,
      };
    } catch (err) {
      this.logger.error('Document AI processing failed', err);
      // Return partial result so invoice is not stuck — caller marks as failed
      return {
        confidence: 0,
        rawJson: { error: String(err) },
      };
    }
  }
}
