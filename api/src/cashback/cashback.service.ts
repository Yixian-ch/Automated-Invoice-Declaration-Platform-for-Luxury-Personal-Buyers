import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LineItemInput {
  description?: string;
  brand?: string | null;
  itemCategory?: string | null;
  amount_ttc: number;
}

export interface CashbackBreakdownItem {
  description: string;
  brand: string | null;
  itemCategory: string | null;
  amountTTC: number;
  merchantRate: number;
  brandRate: number;
  cashback: number;
}

export interface CashbackResult {
  totalCashback: number;
  merchantRate: number;
  breakdown: CashbackBreakdownItem[];
}

interface CachedRules {
  merchants: {
    merchantKey: string;
    matchKeywords: string[];
    defaultRate: number;
    brandRules: {
      brands: string[];
      rate: number;
      sortOrder: number;
    }[];
  }[];
  loadedAt: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

const GALERIES_LAFAYETTE_KEY = 'galeries_lafayette';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class CashbackService {
  private readonly logger = new Logger(CashbackService.name);
  private cache: CachedRules | null = null;

  constructor(private readonly prisma: PrismaService) {}

  invalidateCache() {
    this.cache = null;
  }

  private async loadRules(): Promise<CachedRules['merchants']> {
    if (this.cache && Date.now() - this.cache.loadedAt < CACHE_TTL_MS) {
      return this.cache.merchants;
    }

    const configs = await this.prisma.merchantCashbackConfig.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { brandRules: { orderBy: { sortOrder: 'asc' } } },
    });

    const merchants = configs.map((c) => ({
      merchantKey: c.merchantKey,
      matchKeywords: c.matchKeywords.map((k) => k.toLowerCase()),
      defaultRate: Number(c.defaultRate),
      brandRules: c.brandRules.map((r) => ({
        brands: r.brands.map((b) => b.toLowerCase()),
        rate: Number(r.rate),
        sortOrder: r.sortOrder,
      })),
    }));

    this.cache = { merchants, loadedAt: Date.now() };
    return merchants;
  }

  /**
   * Channel factor for GL: 0.88 if détaxe ratio ≤ 12%, else 0.833.
   * All other merchants: 0.833.
   */
  private getChannelFactor(
    merchantKey: string,
    grandTotalTTC: number,
    taxRefundAmount: number | null,
  ): number {
    if (merchantKey === GALERIES_LAFAYETTE_KEY && taxRefundAmount != null && grandTotalTTC > 0) {
      return taxRefundAmount / grandTotalTTC <= 0.12 ? 0.88 : 0.833;
    }
    return 0.833;
  }

  private matchMerchant(vendorName: string, merchants: CachedRules['merchants']) {
    const normalized = vendorName.toLowerCase().trim();
    return (
      merchants.find((m) => m.matchKeywords.some((kw) => normalized.includes(kw))) ?? null
    );
  }

  private getBrandRate(
    brand: string | null,
    category: string | null,
    rules: CachedRules['merchants'][0]['brandRules'],
  ): number {
    if (!brand && !category) return -1; // signal: use default

    const normalizedBrand = (brand ?? '').toLowerCase().trim();
    const normalizedCategory = (category ?? '').toLowerCase().trim();
    const needle = `${normalizedBrand} ${normalizedCategory}`.trim();

    for (const rule of rules) {
      const match = rule.brands.some(
        (b) => normalizedBrand.includes(b) || needle.includes(b),
      );
      if (match) return rule.rate;
    }

    return -1; // no rule matched → use merchant default
  }

  /**
   * Calculates cashback for an invoice.
   *
   * Formula per line item:
   *   cashback = amount_ttc × channelFactor × brandRate
   *
   * channelFactor (GL only):
   *   détaxe/TTC ≤ 12% → 0.88 | > 12% → 0.833 | others → 0.833
   *
   * brandRate: first matching rule in merchant's brand rule table,
   *            fallback to merchant's defaultRate.
   */
  async calculate(
    vendorName: string | null,
    grandTotalTTC: number,
    taxRefundAmount: number | null,
    lineItems: LineItemInput[],
  ): Promise<CashbackResult | null> {
    if (!vendorName || grandTotalTTC <= 0 || lineItems.length === 0) return null;

    const merchants = await this.loadRules();
    const merchant = this.matchMerchant(vendorName, merchants);

    if (!merchant) {
      this.logger.warn(`No cashback config found for vendor: "${vendorName}"`);
      return null;
    }

    const channelFactor = this.getChannelFactor(
      merchant.merchantKey,
      grandTotalTTC,
      taxRefundAmount,
    );

    const breakdown: CashbackBreakdownItem[] = lineItems.map((item) => {
      const matched = this.getBrandRate(
        item.brand ?? null,
        item.itemCategory ?? null,
        merchant.brandRules,
      );
      const brandRate = matched >= 0 ? matched : merchant.defaultRate;
      return {
        description: item.description ?? '',
        brand: item.brand ?? null,
        itemCategory: item.itemCategory ?? null,
        amountTTC: item.amount_ttc,
        merchantRate: channelFactor,
        brandRate,
        cashback: item.amount_ttc * channelFactor * brandRate,
      };
    });

    const totalCashback = breakdown.reduce((s, i) => s + i.cashback, 0);

    this.logger.debug(
      `Cashback vendor="${vendorName}" key=${merchant.merchantKey} ` +
        `channelFactor=${channelFactor} total=${totalCashback.toFixed(2)}`,
    );

    return { totalCashback, merchantRate: channelFactor, breakdown };
  }
}
