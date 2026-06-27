-- Add taxRefundAmount (Montant de la détaxe) and cashbackBreakdown fields to Invoice

ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "taxRefundAmount" DECIMAL(12,2);
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "cashbackBreakdown" JSONB;
