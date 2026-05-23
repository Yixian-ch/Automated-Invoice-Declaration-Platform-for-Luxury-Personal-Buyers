/*
  Warnings:

  - You are about to drop the column `sumsubKybApplicantId` on the `organizations` table. All the data in the column will be lost.
  - You are about to drop the column `sumsubKybApplicantId` on the `users` table. All the data in the column will be lost.
  - You are about to drop the column `sumsubKycApplicantId` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "organizations" DROP COLUMN "sumsubKybApplicantId",
ADD COLUMN     "diditKybSessionId" TEXT;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "sumsubKybApplicantId",
DROP COLUMN "sumsubKycApplicantId",
ADD COLUMN     "diditKybSessionId" TEXT,
ADD COLUMN     "diditKycSessionId" TEXT;
