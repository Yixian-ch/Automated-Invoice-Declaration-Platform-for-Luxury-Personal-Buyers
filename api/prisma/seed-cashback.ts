/**
 * Seed script for merchant cashback rules (2026-04-22 update).
 * Run: DATABASE_URL="..." npx tsx prisma/seed-cashback.ts
 *
 * All keywords are lowercase French / as they appear on French receipts.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MERCHANTS = [
  {
    merchantKey: 'galeries_lafayette',
    displayName: '巴黎老佛爷',
    matchKeywords: ['galeries lafayette', 'galeries lafayette haussmann', 'gl haussmann', 'galeries lafayette paris'],
    defaultRate: 0.11,
    notes:
      '退税：退到支付宝或退到卡 10.8%；退现金 200€/天；单品牌满 3 万欧 16.67%。SUNGLASSES 柜台的香奈儿眼镜按常规 11% 计算。',
    sortOrder: 1,
    brandRules: [
      {
        displayLabel: 'Van Cleef & Arpels',
        brands: ['van cleef', 'van cleef & arpels', 'van cleef arpels', 'vcaf'],
        rate: 0.10,
        sortOrder: 10,
      },
      {
        displayLabel: 'Chanel Joaillerie',
        brands: ['chanel joaillerie', 'chanel bijoux', 'chanel fine jewellery', 'chanel fine jewelry'],
        rate: 0.05,
        condition: '必须珠宝区结账',
        sortOrder: 20,
      },
      {
        displayLabel: 'TUDOR | PRADA | GUCCI | DIOR | ROLEX | CARTIER',
        brands: ['tudor', 'prada', 'gucci', 'dior', 'christian dior', 'parfums christian dior', 'rolex', 'cartier'],
        rate: 0.04,
        sortOrder: 30,
      },
      {
        displayLabel: 'Pharmacie (B-1) | Chocolat & Alimentation',
        brands: ['pharmacie', 'parapharmacie', 'chocolat', 'confiserie', 'epicerie', 'alimentation', 'patisserie', 'boulangerie'],
        rate: 0.03,
        sortOrder: 40,
      },
      {
        displayLabel: 'Louis Vuitton | Chanel | Hermès Beauté',
        brands: ['louis vuitton', 'chanel', 'hermes beaute', 'hermès beauté', 'hermes soin', 'hermès soin'],
        rate: 0.00,
        sortOrder: 50,
      },
    ],
  },
  {
    merchantKey: 'la_samaritaine',
    displayName: '巴黎莎玛丽丹 (DFS)',
    matchKeywords: ['samaritaine', 'la samaritaine', 'dfs paris', 'dfs samaritaine', 'dfs la samaritaine'],
    defaultRate: 0.12,
    notes: '',
    sortOrder: 2,
    brandRules: [
      {
        displayLabel: 'Moncler | Celine | Loewe | De Beers | Inoui Editions',
        brands: ['moncler', 'celine', 'céline', 'loewe', 'de beers', 'inoui editions', 'inoui'],
        rate: 0.10,
        sortOrder: 10,
      },
      {
        displayLabel: 'Gucci | Zegna | Tudor | Chaumet | Max Mara | Tiffany | Van Cleef | Cartier | Prada | Bulgari | YSL | Fendi | Dior | Bottega Veneta | Burberry',
        brands: [
          'gucci', 'ermenegildo zegna', 'zegna', 'tudor',
          'chaumet', 'max mara', 'maxmara',
          'tiffany', 'tiffany & co',
          'van cleef', 'van cleef & arpels',
          'cartier',
          'prada',
          'bvlgari', 'bulgari',
          'saint laurent', 'yves saint laurent',
          'fendi',
          'dior', 'christian dior', 'parfums christian dior',
          'bottega veneta',
          'burberry',
        ],
        rate: 0.06,
        sortOrder: 20,
      },
      {
        displayLabel: 'Vacheron Constantin | Hugo Boss | Arc\'teryx | Alimentation (Jelly Cat…)',
        brands: [
          'vacheron', 'vacheron constantin',
          'hugo boss',
          "arc'teryx", 'arcteryx',
          'epicerie', 'alimentation', 'confiserie', 'jellycats', 'jellycat',
        ],
        rate: 0.04,
        sortOrder: 30,
      },
      {
        displayLabel: 'Helena Rubinstein | Chanel Joaillerie | Guerlain',
        brands: [
          'helena rubinstein',
          'chanel joaillerie', 'chanel bijoux', 'chanel fine jewellery',
          'guerlain',
        ],
        rate: 0.03,
        sortOrder: 40,
      },
      {
        displayLabel: 'Dior Beauté | Chanel Beauté | Chanel Souliers',
        brands: [
          'dior beaute', 'dior beauté', 'parfums dior',
          'chanel beaute', 'chanel beauté', 'chanel parfums',
          'chanel souliers', 'chanel chaussures',
        ],
        rate: 0.02,
        condition: '迪奥和香奈儿化妆品；香奈儿鞋子',
        sortOrder: 50,
      },
      {
        displayLabel: 'Louis Vuitton | Chanel | Jean Rousseau | Izipizi | Alohas',
        brands: ['louis vuitton', 'chanel', 'jean rousseau', 'izipizi', 'alohas'],
        rate: 0.00,
        sortOrder: 60,
      },
    ],
  },
  {
    merchantKey: 'bucherer_paris',
    displayName: '巴黎宝齐莱表行',
    matchKeywords: ['bucherer', 'bucherer paris', 'bucherer france'],
    defaultRate: 0.12,
    notes:
      '宝齐莱结算汇率与其他商场不同（详询客服）。购物前需确认是否挂团，否则无返利。包含宝齐莱主店和欧米茄，不包含旁边的卡地亚和豪雅。',
    sortOrder: 3,
    brandRules: [
      {
        displayLabel: 'Rolex',
        brands: ['rolex'],
        rate: 0.06,
        sortOrder: 10,
      },
      {
        displayLabel: 'Audemars Piguet | Occasion (montres)',
        brands: ['audemars piguet', 'occasion', 'pre-owned', 'seconde main', 'montre occasion'],
        rate: 0.00,
        sortOrder: 20,
      },
    ],
  },
  {
    merchantKey: 'tour_eiffel_duty_free',
    displayName: '铁塔免税店',
    matchKeywords: ['tour eiffel', 'boutique tour eiffel', 'sete', 'societe exploitation tour eiffel'],
    defaultRate: 0.15,
    notes: '任意金额均可返点。消费满 1000€ 报销 20€ 打车费。',
    sortOrder: 4,
    brandRules: [
      {
        displayLabel: 'Compléments alimentaires / Santé',
        brands: ['complement alimentaire', 'complements alimentaires', 'sante', 'supplement', 'vitamine', 'nutraceutique'],
        rate: 0.10,
        sortOrder: 10,
      },
    ],
  },
  {
    merchantKey: 'paris_look',
    displayName: 'PARIS LOOK',
    matchKeywords: ['paris look'],
    defaultRate: 0.15,
    notes: '任意金额均可返点。',
    sortOrder: 5,
    brandRules: [],
  },
  {
    merchantKey: 'fauchon',
    displayName: '花宫娜 (Fauchon)',
    matchKeywords: ['fauchon', 'maison fauchon'],
    defaultRate: 0.10,
    notes: '任意金额均可返点。需要提前咨询客服。',
    sortOrder: 6,
    brandRules: [],
  },
  {
    merchantKey: 'pharmacie',
    displayName: '药妆',
    matchKeywords: ['pharmacie', 'officine', 'parapharmacie', 'pharmacie fangzheng'],
    defaultRate: 0.10,
    notes:
      '热卖款商品齐全（指定三家方正药房）。退税：1 万以下 12%，1 万欧 15.6%，满 3 万欧 16.67%（仅限珠宝手表）。店内每天可领取 1000 欧元退税。单件产品金额超 5 万欧需联系客服确认点数，超 10 万欧 0 返点。',
    sortOrder: 7,
    brandRules: [],
  },
];

async function main() {
  console.log('Seeding merchant cashback rules…');

  for (const m of MERCHANTS) {
    const { brandRules, ...merchantData } = m;

    const merchant = await prisma.merchantCashbackConfig.upsert({
      where: { merchantKey: merchantData.merchantKey },
      update: {
        displayName: merchantData.displayName,
        matchKeywords: merchantData.matchKeywords,
        defaultRate: merchantData.defaultRate,
        notes: merchantData.notes,
        sortOrder: merchantData.sortOrder,
      },
      create: { ...merchantData },
    });

    await prisma.brandCashbackRule.deleteMany({ where: { merchantId: merchant.id } });

    for (const rule of brandRules) {
      await prisma.brandCashbackRule.create({
        data: { ...rule, merchantId: merchant.id },
      });
    }

    console.log(`  ✔ ${merchant.displayName} (${brandRules.length} brand rules)`);
  }

  console.log('Done.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
