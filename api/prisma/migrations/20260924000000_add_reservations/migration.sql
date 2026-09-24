-- 预约购物:商家表、预约表、小票关联字段

CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED');

CREATE TABLE "merchants" (
  "id" TEXT NOT NULL,
  "taxId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "merchants_taxId_key" ON "merchants"("taxId");

CREATE TABLE "reservations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "merchantId" TEXT NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "rejectNote" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reservations_userId_status_idx" ON "reservations"("userId", "status");
CREATE INDEX "reservations_merchantId_startAt_endAt_idx" ON "reservations"("merchantId", "startAt", "endAt");

ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "reservations_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invoices"
  ADD COLUMN "reservationId" TEXT,
  ADD COLUMN "matchedMerchantId" TEXT,
  ADD COLUMN "rejectReason" TEXT;

CREATE INDEX "invoices_reservationId_idx" ON "invoices"("reservationId");

ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "invoices_matchedMerchantId_fkey" FOREIGN KEY ("matchedMerchantId") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
