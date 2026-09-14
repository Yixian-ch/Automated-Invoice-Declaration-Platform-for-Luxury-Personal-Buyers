-- Remove Didit / KYC / KYB verification: documents are upload-only now.
-- Keep uploaded files by renaming the key columns.
ALTER TABLE "users" RENAME COLUMN "kycDocumentKey" TO "passportDocumentKey";
ALTER TABLE "users" RENAME COLUMN "kybDocumentKey" TO "businessLicenseKey";

ALTER TABLE "users"
  DROP COLUMN "kycStatus",
  DROP COLUMN "kycDocumentExpiresAt",
  DROP COLUMN "kybStatus",
  DROP COLUMN "kybDocumentExpiresAt",
  DROP COLUMN "diditKycSessionId",
  DROP COLUMN "diditKybSessionId";

ALTER TABLE "organizations"
  DROP COLUMN "kybStatus",
  DROP COLUMN "diditKybSessionId";

-- Drop KYC_PENDING from UserStatus (postgres cannot remove an enum value in place)
UPDATE "users" SET "status" = 'REGISTERED' WHERE "status" = 'KYC_PENDING';
ALTER TYPE "UserStatus" RENAME TO "UserStatus_old";
CREATE TYPE "UserStatus" AS ENUM ('REGISTERED', 'ACTIVE', 'SUSPENDED', 'BLACKLISTED');
ALTER TABLE "users" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "status" TYPE "UserStatus" USING ("status"::text::"UserStatus");
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'REGISTERED';
DROP TYPE "UserStatus_old";

DROP TYPE "KycStatus";
DROP TYPE "KybStatus";
