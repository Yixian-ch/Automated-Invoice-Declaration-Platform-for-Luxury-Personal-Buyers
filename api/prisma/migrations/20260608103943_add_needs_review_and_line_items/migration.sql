-- AlterEnum
ALTER TYPE "InvoiceStatus" ADD VALUE 'NEEDS_REVIEW';

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "arithmeticCheck" TEXT,
ADD COLUMN     "lineItems" JSONB,
ADD COLUMN     "needsReview" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reviewReasons" TEXT[];
