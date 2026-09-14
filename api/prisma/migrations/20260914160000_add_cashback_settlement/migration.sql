-- Customer cashback settlement: confirmation, method choice, automatic payout
CREATE TYPE "SettlementMethod" AS ENUM ('BANK_TRANSFER');
CREATE TYPE "SettlementStatus" AS ENUM ('CONFIRMED', 'SENT', 'PAID', 'FAILED');

ALTER TABLE "users"
  ADD COLUMN "bankAccountName" TEXT,
  ADD COLUMN "bankIban" TEXT,
  ADD COLUMN "bankBic" TEXT;

CREATE TABLE "cashback_settlements" (
  "id" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" "SettlementMethod" NOT NULL,
  "status" "SettlementStatus" NOT NULL DEFAULT 'CONFIRMED',
  "bankAccountName" TEXT,
  "bankIban" TEXT,
  "bankBic" TEXT,
  "partnerRef" TEXT,
  "failureReason" TEXT,
  "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cashback_settlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cashback_settlements_invoiceId_key" ON "cashback_settlements"("invoiceId");
CREATE INDEX "cashback_settlements_userId_idx" ON "cashback_settlements"("userId");
CREATE INDEX "cashback_settlements_status_idx" ON "cashback_settlements"("status");

ALTER TABLE "cashback_settlements" ADD CONSTRAINT "cashback_settlements_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cashback_settlements" ADD CONSTRAINT "cashback_settlements_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
