-- Unify InvoiceStatus: collapse all transient states into PENDING.
--
-- PostgreSQL cannot remove values from an existing enum type, so we:
--   1. Drop the column default
--   2. Cast the column to TEXT (bypasses the enum constraint)
--   3. Migrate all non-terminal statuses to 'PENDING'
--   4. Drop the old enum type
--   5. Create a new simplified enum
--   6. Restore the column with the new type and default

-- Step 1: Drop existing column default
ALTER TABLE "invoices" ALTER COLUMN "status" DROP DEFAULT;

-- Step 2: Convert column to TEXT so we can freely update values
ALTER TABLE "invoices" ALTER COLUMN "status" TYPE TEXT;

-- Step 3: Migrate data — everything that isn't a terminal state becomes PENDING
UPDATE "invoices"
SET "status" = 'PENDING'
WHERE "status" NOT IN ('APPROVED', 'REJECTED');

-- Step 4: Drop the old enum (all column references have been converted to TEXT)
DROP TYPE "InvoiceStatus";

-- Step 5: Create the new simplified enum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Step 6: Restore the column with the new type and default
ALTER TABLE "invoices"
  ALTER COLUMN "status" TYPE "InvoiceStatus" USING "status"::"InvoiceStatus",
  ALTER COLUMN "status" SET DEFAULT 'PENDING'::"InvoiceStatus";
