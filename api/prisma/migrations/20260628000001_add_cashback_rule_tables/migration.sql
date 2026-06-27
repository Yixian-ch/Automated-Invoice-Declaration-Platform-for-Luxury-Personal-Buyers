-- Create merchant cashback config table
CREATE TABLE IF NOT EXISTS "merchant_cashback_configs" (
    "id"            TEXT NOT NULL,
    "merchantKey"   TEXT NOT NULL,
    "displayName"   TEXT NOT NULL,
    "matchKeywords" TEXT[] NOT NULL DEFAULT '{}',
    "defaultRate"   DECIMAL(5,4) NOT NULL DEFAULT 0,
    "notes"         TEXT,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "sortOrder"     INTEGER NOT NULL DEFAULT 0,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "merchant_cashback_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "merchant_cashback_configs_merchantKey_key"
    ON "merchant_cashback_configs"("merchantKey");

-- Create brand cashback rule table
CREATE TABLE IF NOT EXISTS "brand_cashback_rules" (
    "id"           TEXT NOT NULL,
    "merchantId"   TEXT NOT NULL,
    "displayLabel" TEXT NOT NULL,
    "brands"       TEXT[] NOT NULL DEFAULT '{}',
    "rate"         DECIMAL(5,4) NOT NULL DEFAULT 0,
    "condition"    TEXT,
    "sortOrder"    INTEGER NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "brand_cashback_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "brand_cashback_rules_merchantId_fkey"
        FOREIGN KEY ("merchantId") REFERENCES "merchant_cashback_configs"("id") ON DELETE CASCADE
);
