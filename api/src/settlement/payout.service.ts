import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface PayoutRequest {
  settlementId: string;
  amount: string; // decimal string, EUR
  currency: 'EUR';
  beneficiaryName: string;
  iban: string;
  bic?: string;
  reference: string; // shown on the bank statement
}

export interface PayoutResult {
  ok: boolean;
  partnerRef?: string;
  error?: string;
}

/**
 * Pushes payout orders to the partner payment company.
 * The partner pays the customer as soon as it receives the data.
 *
 * Config:
 *   PAYOUT_API_URL   — partner endpoint receiving payout orders
 *   PAYOUT_API_KEY   — bearer token for that endpoint
 *   BYPASS_PAYOUT    — dev flag: log and simulate success instead of calling out
 */
@Injectable()
export class PayoutService {
  private readonly logger = new Logger(PayoutService.name);

  constructor(private readonly config: ConfigService) {}

  async sendPayout(req: PayoutRequest): Promise<PayoutResult> {
    if (this.config.get('BYPASS_PAYOUT') === 'true') {
      this.logger.log(
        `[BYPASS_PAYOUT] simulated payout ${req.settlementId}: €${req.amount} → ${req.iban}`,
      );
      return { ok: true, partnerRef: `dev-${req.settlementId}` };
    }

    const url = this.config.get<string>('PAYOUT_API_URL');
    const apiKey = this.config.get<string>('PAYOUT_API_KEY');
    if (!url || !apiKey) {
      return { ok: false, error: 'Payout API is not configured (PAYOUT_API_URL / PAYOUT_API_KEY)' };
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          // Same settlement always sends the same key, so the partner can
          // dedupe a retry of an order it already accepted
          'Idempotency-Key': req.settlementId,
        },
        body: JSON.stringify(req),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.error(`Payout ${req.settlementId} rejected: ${res.status} ${body}`);
        return { ok: false, error: `Partner returned ${res.status}` };
      }
      const data = (await res.json().catch(() => ({}))) as { reference?: string; id?: string };
      return { ok: true, partnerRef: data.reference ?? data.id };
    } catch (err) {
      this.logger.error(`Payout ${req.settlementId} failed`, err as Error);
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }
}
