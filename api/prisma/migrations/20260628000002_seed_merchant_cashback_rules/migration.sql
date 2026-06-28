-- Seed baseline merchant cashback configs.
-- Uses ON CONFLICT DO NOTHING so admin edits made through the UI are never overwritten.

-- ── Merchants ────────────────────────────────────────────────────────────────

INSERT INTO merchant_cashback_configs
  (id, "merchantKey", "displayName", "matchKeywords", "defaultRate", "notes", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  (
    gen_random_uuid(), 'galeries_lafayette', '巴黎老佛爷',
    ARRAY['galeries lafayette','galeries lafayette haussmann','gl haussmann','galeries lafayette paris'],
    0.11,
    '退税：退到支付宝或退到卡 10.8%；退现金 200€/天；单品牌满 3 万欧 16.67%。SUNGLASSES 柜台的香奈儿眼镜按常规 11% 计算。',
    true, 1, NOW(), NOW()
  ),
  (
    gen_random_uuid(), 'la_samaritaine', '巴黎莎玛丽丹 (DFS)',
    ARRAY['samaritaine','la samaritaine','dfs paris','dfs samaritaine','dfs la samaritaine'],
    0.12, '', true, 2, NOW(), NOW()
  ),
  (
    gen_random_uuid(), 'bucherer_paris', '巴黎宝齐莱表行',
    ARRAY['bucherer','bucherer paris','bucherer france'],
    0.12,
    '宝齐莱结算汇率与其他商场不同（详询客服）。购物前需确认是否挂团，否则无返利。包含宝齐莱主店和欧米茄，不包含旁边的卡地亚和豪雅。',
    true, 3, NOW(), NOW()
  ),
  (
    gen_random_uuid(), 'tour_eiffel_duty_free', '铁塔免税店',
    ARRAY['tour eiffel','boutique tour eiffel','sete','societe exploitation tour eiffel'],
    0.15, '任意金额均可返点。消费满 1000€ 报销 20€ 打车费。',
    true, 4, NOW(), NOW()
  ),
  (
    gen_random_uuid(), 'paris_look', 'PARIS LOOK',
    ARRAY['paris look'],
    0.15, '任意金额均可返点。',
    true, 5, NOW(), NOW()
  ),
  (
    gen_random_uuid(), 'fauchon', '花宫娜 (Fauchon)',
    ARRAY['fauchon','maison fauchon'],
    0.10, '任意金额均可返点。需要提前咨询客服。',
    true, 6, NOW(), NOW()
  ),
  (
    gen_random_uuid(), 'pharmacie', '药妆',
    ARRAY['pharmacie','officine','parapharmacie','pharmacie fangzheng'],
    0.10,
    '热卖款商品齐全（指定三家方正药房）。退税：1 万以下 12%，1 万欧 15.6%，满 3 万欧 16.67%（仅限珠宝手表）。店内每天可领取 1000 欧元退税。单件产品金额超 5 万欧需联系客服确认点数，超 10 万欧 0 返点。',
    true, 7, NOW(), NOW()
  )
ON CONFLICT ("merchantKey") DO NOTHING;

-- ── Brand rules — Galeries Lafayette ─────────────────────────────────────────

INSERT INTO brand_cashback_rules
  (id, "merchantId", "displayLabel", brands, rate, condition, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), mcc.id, 'Van Cleef & Arpels',
  ARRAY['van cleef','van cleef & arpels','van cleef arpels','vcaf'],
  0.10, NULL, 10, NOW(), NOW()
FROM merchant_cashback_configs mcc WHERE mcc."merchantKey" = 'galeries_lafayette'
AND NOT EXISTS (
  SELECT 1 FROM brand_cashback_rules bcr WHERE bcr."merchantId" = mcc.id AND bcr."displayLabel" = 'Van Cleef & Arpels'
);

INSERT INTO brand_cashback_rules
  (id, "merchantId", "displayLabel", brands, rate, condition, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), mcc.id, 'Chanel Joaillerie',
  ARRAY['chanel joaillerie','chanel bijoux','chanel fine jewellery','chanel fine jewelry'],
  0.05, '必须珠宝区结账', 20, NOW(), NOW()
FROM merchant_cashback_configs mcc WHERE mcc."merchantKey" = 'galeries_lafayette'
AND NOT EXISTS (
  SELECT 1 FROM brand_cashback_rules bcr WHERE bcr."merchantId" = mcc.id AND bcr."displayLabel" = 'Chanel Joaillerie'
);

INSERT INTO brand_cashback_rules
  (id, "merchantId", "displayLabel", brands, rate, condition, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), mcc.id, 'TUDOR | PRADA | GUCCI | DIOR | ROLEX | CARTIER',
  ARRAY['tudor','prada','gucci','dior','christian dior','parfums christian dior','rolex','cartier'],
  0.04, NULL, 30, NOW(), NOW()
FROM merchant_cashback_configs mcc WHERE mcc."merchantKey" = 'galeries_lafayette'
AND NOT EXISTS (
  SELECT 1 FROM brand_cashback_rules bcr WHERE bcr."merchantId" = mcc.id AND bcr."displayLabel" = 'TUDOR | PRADA | GUCCI | DIOR | ROLEX | CARTIER'
);

INSERT INTO brand_cashback_rules
  (id, "merchantId", "displayLabel", brands, rate, condition, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), mcc.id, 'Pharmacie (B-1) | Chocolat & Alimentation',
  ARRAY['pharmacie','parapharmacie','chocolat','confiserie','epicerie','alimentation','patisserie','boulangerie'],
  0.03, NULL, 40, NOW(), NOW()
FROM merchant_cashback_configs mcc WHERE mcc."merchantKey" = 'galeries_lafayette'
AND NOT EXISTS (
  SELECT 1 FROM brand_cashback_rules bcr WHERE bcr."merchantId" = mcc.id AND bcr."displayLabel" = 'Pharmacie (B-1) | Chocolat & Alimentation'
);

INSERT INTO brand_cashback_rules
  (id, "merchantId", "displayLabel", brands, rate, condition, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), mcc.id, 'Louis Vuitton | Chanel | Hermès Beauté',
  ARRAY['louis vuitton','chanel','hermes beaute','hermès beauté','hermes soin','hermès soin'],
  0.00, NULL, 50, NOW(), NOW()
FROM merchant_cashback_configs mcc WHERE mcc."merchantKey" = 'galeries_lafayette'
AND NOT EXISTS (
  SELECT 1 FROM brand_cashback_rules bcr WHERE bcr."merchantId" = mcc.id AND bcr."displayLabel" = 'Louis Vuitton | Chanel | Hermès Beauté'
);

-- ── Brand rules — La Samaritaine ──────────────────────────────────────────────

INSERT INTO brand_cashback_rules
  (id, "merchantId", "displayLabel", brands, rate, condition, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), mcc.id, 'Moncler | Celine | Loewe | De Beers | Inoui Editions',
  ARRAY['moncler','celine','céline','loewe','de beers','inoui editions','inoui'],
  0.10, NULL, 10, NOW(), NOW()
FROM merchant_cashback_configs mcc WHERE mcc."merchantKey" = 'la_samaritaine'
AND NOT EXISTS (
  SELECT 1 FROM brand_cashback_rules bcr WHERE bcr."merchantId" = mcc.id AND bcr."displayLabel" = 'Moncler | Celine | Loewe | De Beers | Inoui Editions'
);

INSERT INTO brand_cashback_rules
  (id, "merchantId", "displayLabel", brands, rate, condition, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), mcc.id, 'Gucci | Zegna | Tudor | Chaumet | Max Mara | Tiffany | Van Cleef | Cartier | Prada | Bulgari | YSL | Fendi | Dior | Bottega Veneta | Burberry',
  ARRAY['gucci','ermenegildo zegna','zegna','tudor','chaumet','max mara','maxmara','tiffany','tiffany & co','van cleef','van cleef & arpels','cartier','prada','bvlgari','bulgari','saint laurent','yves saint laurent','fendi','dior','christian dior','parfums christian dior','bottega veneta','burberry'],
  0.06, NULL, 20, NOW(), NOW()
FROM merchant_cashback_configs mcc WHERE mcc."merchantKey" = 'la_samaritaine'
AND NOT EXISTS (
  SELECT 1 FROM brand_cashback_rules bcr WHERE bcr."merchantId" = mcc.id AND bcr."displayLabel" = 'Gucci | Zegna | Tudor | Chaumet | Max Mara | Tiffany | Van Cleef | Cartier | Prada | Bulgari | YSL | Fendi | Dior | Bottega Veneta | Burberry'
);

INSERT INTO brand_cashback_rules
  (id, "merchantId", "displayLabel", brands, rate, condition, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), mcc.id, 'Vacheron Constantin | Hugo Boss | Arc''teryx | Alimentation',
  ARRAY['vacheron','vacheron constantin','hugo boss','arc''teryx','arcteryx','epicerie','alimentation','confiserie','jellycats','jellycat'],
  0.04, NULL, 30, NOW(), NOW()
FROM merchant_cashback_configs mcc WHERE mcc."merchantKey" = 'la_samaritaine'
AND NOT EXISTS (
  SELECT 1 FROM brand_cashback_rules bcr WHERE bcr."merchantId" = mcc.id AND bcr."displayLabel" = 'Vacheron Constantin | Hugo Boss | Arc''teryx | Alimentation'
);

INSERT INTO brand_cashback_rules
  (id, "merchantId", "displayLabel", brands, rate, condition, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), mcc.id, 'Helena Rubinstein | Chanel Joaillerie | Guerlain',
  ARRAY['helena rubinstein','chanel joaillerie','chanel bijoux','chanel fine jewellery','guerlain'],
  0.03, NULL, 40, NOW(), NOW()
FROM merchant_cashback_configs mcc WHERE mcc."merchantKey" = 'la_samaritaine'
AND NOT EXISTS (
  SELECT 1 FROM brand_cashback_rules bcr WHERE bcr."merchantId" = mcc.id AND bcr."displayLabel" = 'Helena Rubinstein | Chanel Joaillerie | Guerlain'
);

INSERT INTO brand_cashback_rules
  (id, "merchantId", "displayLabel", brands, rate, condition, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), mcc.id, 'Dior Beauté | Chanel Beauté | Chanel Souliers',
  ARRAY['dior beaute','dior beauté','parfums dior','chanel beaute','chanel beauté','chanel parfums','chanel souliers','chanel chaussures'],
  0.02, '迪奥和香奈儿化妆品；香奈儿鞋子', 50, NOW(), NOW()
FROM merchant_cashback_configs mcc WHERE mcc."merchantKey" = 'la_samaritaine'
AND NOT EXISTS (
  SELECT 1 FROM brand_cashback_rules bcr WHERE bcr."merchantId" = mcc.id AND bcr."displayLabel" = 'Dior Beauté | Chanel Beauté | Chanel Souliers'
);

INSERT INTO brand_cashback_rules
  (id, "merchantId", "displayLabel", brands, rate, condition, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), mcc.id, 'Louis Vuitton | Chanel | Jean Rousseau | Izipizi | Alohas',
  ARRAY['louis vuitton','chanel','jean rousseau','izipizi','alohas'],
  0.00, NULL, 60, NOW(), NOW()
FROM merchant_cashback_configs mcc WHERE mcc."merchantKey" = 'la_samaritaine'
AND NOT EXISTS (
  SELECT 1 FROM brand_cashback_rules bcr WHERE bcr."merchantId" = mcc.id AND bcr."displayLabel" = 'Louis Vuitton | Chanel | Jean Rousseau | Izipizi | Alohas'
);

-- ── Brand rules — Bucherer Paris ──────────────────────────────────────────────

INSERT INTO brand_cashback_rules
  (id, "merchantId", "displayLabel", brands, rate, condition, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), mcc.id, 'Rolex',
  ARRAY['rolex'],
  0.06, NULL, 10, NOW(), NOW()
FROM merchant_cashback_configs mcc WHERE mcc."merchantKey" = 'bucherer_paris'
AND NOT EXISTS (
  SELECT 1 FROM brand_cashback_rules bcr WHERE bcr."merchantId" = mcc.id AND bcr."displayLabel" = 'Rolex'
);

INSERT INTO brand_cashback_rules
  (id, "merchantId", "displayLabel", brands, rate, condition, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), mcc.id, 'Audemars Piguet | Occasion',
  ARRAY['audemars piguet','occasion','pre-owned','seconde main','montre occasion'],
  0.00, NULL, 20, NOW(), NOW()
FROM merchant_cashback_configs mcc WHERE mcc."merchantKey" = 'bucherer_paris'
AND NOT EXISTS (
  SELECT 1 FROM brand_cashback_rules bcr WHERE bcr."merchantId" = mcc.id AND bcr."displayLabel" = 'Audemars Piguet | Occasion'
);

-- ── Brand rules — Tour Eiffel Duty Free ──────────────────────────────────────

INSERT INTO brand_cashback_rules
  (id, "merchantId", "displayLabel", brands, rate, condition, "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid(), mcc.id, 'Compléments alimentaires / Santé',
  ARRAY['complement alimentaire','complements alimentaires','sante','supplement','vitamine','nutraceutique'],
  0.10, NULL, 10, NOW(), NOW()
FROM merchant_cashback_configs mcc WHERE mcc."merchantKey" = 'tour_eiffel_duty_free'
AND NOT EXISTS (
  SELECT 1 FROM brand_cashback_rules bcr WHERE bcr."merchantId" = mcc.id AND bcr."displayLabel" = 'Compléments alimentaires / Santé'
);
