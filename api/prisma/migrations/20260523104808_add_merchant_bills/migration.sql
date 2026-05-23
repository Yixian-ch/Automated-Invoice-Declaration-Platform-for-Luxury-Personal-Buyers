-- CreateTable
CREATE TABLE "merchant_bills" (
    "id" TEXT NOT NULL,
    "merchantName" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "merchant_bills_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "merchant_bills_merchantName_idx" ON "merchant_bills"("merchantName");

-- CreateIndex
CREATE INDEX "merchant_bills_date_idx" ON "merchant_bills"("date");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_bills_merchantName_date_key" ON "merchant_bills"("merchantName", "date");
