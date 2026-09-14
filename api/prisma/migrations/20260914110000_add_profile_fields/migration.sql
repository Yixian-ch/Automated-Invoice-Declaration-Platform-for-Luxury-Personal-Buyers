-- Add profile fields for the "my profile" page
ALTER TABLE "users" ADD COLUMN "kybDocumentKey" TEXT;
ALTER TABLE "users" ADD COLUMN "address" TEXT;
