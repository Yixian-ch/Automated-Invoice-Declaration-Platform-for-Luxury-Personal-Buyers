-- 数据迁移 + 条形码去重索引

-- 1) 旧的 APPROVED 小票:已有结算记录的 → CONFIRMED(客户当时已确认过);
--    没有结算记录的 → AWAITING_CONFIRMATION,让客户走一遍确认
UPDATE "invoices" i
SET "status" = 'CONFIRMED',
    "confirmedAt" = s."confirmedAt"
FROM "cashback_settlements" s
WHERE s."invoiceId" = i."id"
  AND i."status" = 'APPROVED';

UPDATE "invoices"
SET "status" = 'AWAITING_CONFIRMATION'
WHERE "status" = 'APPROVED';

-- 2) 旧 OCR 提取的 cerfa 表单号("N° 15021*04",所有退税单相同)不是条形码号,
--    不能当去重键,置空
UPDATE "invoices"
SET "invoiceNumber" = NULL
WHERE "invoiceNumber" ~ '^\s*(N\s*[°ºo]?\s*)?\d{5}\s*\*\s*\d{2}\s*$';

-- 3) 同用户、非拒绝状态下仍重号的旧记录:保留最早一条,其余置空,
--    否则下面的部分唯一索引建不起来
UPDATE "invoices" i
SET "invoiceNumber" = NULL
WHERE i."invoiceNumber" IS NOT NULL
  AND i."status" <> 'REJECTED'
  AND i."deletedAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "invoices" j
    WHERE j."userId" = i."userId"
      AND j."invoiceNumber" = i."invoiceNumber"
      AND j."status" <> 'REJECTED'
      AND j."deletedAt" IS NULL
      AND (j."createdAt" < i."createdAt" OR (j."createdAt" = i."createdAt" AND j."id" < i."id"))
  );

-- 4) 同用户 + 条形码 + 非拒绝状态 唯一:并发处理同一批里两张同号小票时,
--    数据库兜底保证只有一张放行
CREATE UNIQUE INDEX "invoices_user_barcode_active_key"
  ON "invoices"("userId", "invoiceNumber")
  WHERE "invoiceNumber" IS NOT NULL AND "status" <> 'REJECTED' AND "deletedAt" IS NULL;
