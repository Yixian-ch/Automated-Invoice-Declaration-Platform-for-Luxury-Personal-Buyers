// ─── Merchant channel factor ──────────────────────────────────────────────────
//
// Formula: cashback = TTC × merchantRate × brandRate
//
// 老佛爷 (Galeries Lafayette):
//   détaxe ratio = Montant de la détaxe / Montant total TTC
//   ≤ 12%  → 0.88
//   > 12%  → 0.833
// All other merchants → 0.833

const GALERIES_LAFAYETTE_KEYWORDS = [
  'galeries lafayette',
  'galeries-lafayette',
  'gl haussmann',
  'lafayette',
];

export function getMerchantRate(
  vendorName: string,
  grandTotalTTC: number,
  taxRefundAmount: number | null,
): number {
  const normalized = vendorName.toLowerCase().trim();
  const isGL = GALERIES_LAFAYETTE_KEYWORDS.some((kw) => normalized.includes(kw));

  if (isGL && taxRefundAmount != null && grandTotalTTC > 0) {
    const detaxeRatio = taxRefundAmount / grandTotalTTC;
    return detaxeRatio <= 0.12 ? 0.88 : 0.833;
  }

  return 0.833;
}

// ─── Brand × Category rate table ─────────────────────────────────────────────
//
// Rules are evaluated top-to-bottom; first match wins.
// `brands`     — lowercase keywords matched against the OCR-extracted brand name
// `categories` — if present, rule only applies when category also matches;
//                omit to match any category for the brand
// `rate`       — the brand cashback multiplier, e.g. 0.12 = 12%
//
// ⚠️  Fill in the actual rates below before going live.

interface BrandCategoryRule {
  brands: string[];
  categories?: string[];
  rate: number;
}

export const BRAND_CATEGORY_RULES: BrandCategoryRule[] = [
  // ── Chanel ──────────────────────────────────────────────────────────────────
  // { brands: ['chanel'], categories: ['handbag', 'bag', 'sac'], rate: 0.XX },
  // { brands: ['chanel'], categories: ['shoes', 'chaussures'], rate: 0.XX },
  // { brands: ['chanel'], rate: 0.XX },  // catch-all for Chanel

  // ── Louis Vuitton ────────────────────────────────────────────────────────────
  // { brands: ['louis vuitton', 'lv'], categories: ['handbag', 'bag', 'luggage'], rate: 0.XX },
  // { brands: ['louis vuitton', 'lv'], rate: 0.XX },

  // ── Dior / Christian Dior ────────────────────────────────────────────────────
  // { brands: ['dior', 'christian dior'], categories: ['handbag', 'bag'], rate: 0.XX },
  // { brands: ['dior', 'christian dior'], categories: ['perfume', 'parfum', 'cosmetics'], rate: 0.XX },
  // { brands: ['dior', 'christian dior'], rate: 0.XX },

  // ── Hermès ───────────────────────────────────────────────────────────────────
  // { brands: ['hermes', 'hermès'], rate: 0.XX },

  // ── Gucci ────────────────────────────────────────────────────────────────────
  // { brands: ['gucci'], rate: 0.XX },

  // ── Prada ────────────────────────────────────────────────────────────────────
  // { brands: ['prada'], rate: 0.XX },

  // ── Burberry ─────────────────────────────────────────────────────────────────
  // { brands: ['burberry'], rate: 0.XX },

  // ── Celine / Céline ──────────────────────────────────────────────────────────
  // { brands: ['celine', 'céline'], rate: 0.XX },

  // ── Bottega Veneta ───────────────────────────────────────────────────────────
  // { brands: ['bottega veneta', 'bottega'], rate: 0.XX },

  // ── Saint Laurent / YSL ──────────────────────────────────────────────────────
  // { brands: ['saint laurent', 'ysl', 'yves saint laurent'], rate: 0.XX },

  // ── Balenciaga ───────────────────────────────────────────────────────────────
  // { brands: ['balenciaga'], rate: 0.XX },

  // ── Givenchy ─────────────────────────────────────────────────────────────────
  // { brands: ['givenchy'], rate: 0.XX },

  // ── Loewe ────────────────────────────────────────────────────────────────────
  // { brands: ['loewe'], rate: 0.XX },

  // ── Valentino ────────────────────────────────────────────────────────────────
  // { brands: ['valentino'], rate: 0.XX },

  // ── Fendi ────────────────────────────────────────────────────────────────────
  // { brands: ['fendi'], rate: 0.XX },

  // ── Watches / Montres ────────────────────────────────────────────────────────
  // { brands: ['cartier'], categories: ['watch', 'montre'], rate: 0.XX },
  // { brands: ['rolex'], categories: ['watch', 'montre'], rate: 0.XX },
  // { brands: ['omega'], categories: ['watch', 'montre'], rate: 0.XX },
  // { brands: ['patek philippe'], categories: ['watch', 'montre'], rate: 0.XX },
];

// ─── Rate lookup ──────────────────────────────────────────────────────────────

export function getBrandRate(brand: string | null, category: string | null): number {
  if (!brand) return 0;

  const normalizedBrand = brand.toLowerCase().trim();
  const normalizedCategory = category?.toLowerCase().trim() ?? null;

  for (const rule of BRAND_CATEGORY_RULES) {
    const brandMatch = rule.brands.some((b) => normalizedBrand.includes(b));
    if (!brandMatch) continue;

    if (!rule.categories || !normalizedCategory) return rule.rate;

    const categoryMatch = rule.categories.some((c) => normalizedCategory.includes(c));
    if (categoryMatch) return rule.rate;
  }

  return 0;
}
