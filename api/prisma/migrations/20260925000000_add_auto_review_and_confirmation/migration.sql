-- 自动审核 + 客户确认返点金额(结构部分;数据迁移在下一条迁移里,
-- 因为 Postgres 不允许在同一事务里使用刚 ADD 的枚举值)

ALTER TYPE "InvoiceStatus" ADD VALUE 'AWAITING_CONFIRMATION';
ALTER TYPE "InvoiceStatus" ADD VALUE 'CONFIRMED';
ALTER TYPE "InvoiceStatus" ADD VALUE 'DISPUTED';

ALTER TABLE "invoices"
  ADD COLUMN "imageQuality" DOUBLE PRECISION,
  ADD COLUMN "confirmedAt" TIMESTAMP(3),
  ADD COLUMN "disputedAt" TIMESTAMP(3),
  ADD COLUMN "disputeCategory" TEXT,
  ADD COLUMN "disputeReason" TEXT,
  ADD COLUMN "disputeCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "disputeResolutionNote" TEXT;

CREATE INDEX "invoices_invoiceNumber_idx" ON "invoices"("invoiceNumber");
