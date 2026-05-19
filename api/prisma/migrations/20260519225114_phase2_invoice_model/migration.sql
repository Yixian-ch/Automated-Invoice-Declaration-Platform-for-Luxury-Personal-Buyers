-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'REVIEWER', 'ORG_ADMIN', 'RESELLER');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'APPROVED', 'FAILED', 'EXPIRING', 'EXPIRED');

-- CreateEnum
CREATE TYPE "KybStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'APPROVED', 'FAILED', 'EXPIRING', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('REGISTERED', 'KYC_PENDING', 'ACTIVE', 'SUSPENDED', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "InviteCodeStatus" AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'OCR_PROCESSING', 'OCR_DONE', 'FRAUD_REVIEW', 'APPROVED', 'REJECTED', 'BLACKLISTED');

-- CreateEnum
CREATE TYPE "InvoiceCurrency" AS ENUM ('EUR', 'USD', 'GBP', 'CNY', 'JPY', 'CHF');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registrationNo" TEXT,
    "country" TEXT NOT NULL DEFAULT 'FR',
    "kybStatus" "KybStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "sumsubKybApplicantId" TEXT,
    "cashbackRate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'fr',
    "role" "UserRole" NOT NULL DEFAULT 'RESELLER',
    "status" "UserStatus" NOT NULL DEFAULT 'REGISTERED',
    "accountType" "AccountType" NOT NULL DEFAULT 'INDIVIDUAL',
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "sumsubKycApplicantId" TEXT,
    "kycDocumentExpiresAt" TIMESTAMP(3),
    "kybStatus" "KybStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "sumsubKybApplicantId" TEXT,
    "kybDocumentExpiresAt" TIMESTAMP(3),
    "cashbackRate" DECIMAL(5,4),
    "organizationId" TEXT,
    "refreshTokenHash" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "emailVerificationToken" TEXT,
    "passwordResetToken" TEXT,
    "passwordResetExpiresAt" TIMESTAMP(3),
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecret" TEXT,
    "gdprConsentAt" TIMESTAMP(3),
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invite_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "InviteCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "intendedRole" "UserRole" NOT NULL DEFAULT 'RESELLER',
    "intendedOrgId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "usedByUserId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "s3Key" TEXT,
    "s3Bucket" TEXT,
    "originalFilename" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "invoiceNumber" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "vendorName" TEXT,
    "vendorAddress" TEXT,
    "brandName" TEXT,
    "storeLocation" TEXT,
    "itemDescription" TEXT,
    "itemCategory" TEXT,
    "currency" "InvoiceCurrency",
    "subtotalAmount" DECIMAL(12,2),
    "taxAmount" DECIMAL(12,2),
    "grandTotalAmount" DECIMAL(12,2),
    "cashbackAmount" DECIMAL(12,2),
    "ocrConfidence" DOUBLE PRECISION,
    "ocrRawJson" JSONB,
    "fraudScore" DOUBLE PRECISION,
    "fraudFlags" JSONB,
    "reviewNote" TEXT,
    "uploadedAt" TIMESTAMP(3),
    "ocrCompletedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "meta" JSONB,
    "ipAddress" TEXT,
    "userId" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_emailVerificationToken_key" ON "users"("emailVerificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "users_passwordResetToken_key" ON "users"("passwordResetToken");

-- CreateIndex
CREATE UNIQUE INDEX "invite_codes_code_key" ON "invite_codes"("code");

-- CreateIndex
CREATE INDEX "invoices_userId_idx" ON "invoices"("userId");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_purchaseDate_idx" ON "invoices"("purchaseDate");

-- CreateIndex
CREATE INDEX "invoices_vendorName_idx" ON "invoices"("vendorName");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- CreateIndex
CREATE INDEX "audit_logs_resourceType_resourceId_idx" ON "audit_logs"("resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_intendedOrgId_fkey" FOREIGN KEY ("intendedOrgId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
