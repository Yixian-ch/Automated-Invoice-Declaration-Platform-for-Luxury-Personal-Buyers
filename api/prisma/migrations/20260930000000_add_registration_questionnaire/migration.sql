-- 注册问卷新增字段:性别、国籍、居住国、税务居住国,以及护照签名页/申根签/出入境章
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'OTHER');

ALTER TABLE "users" ADD COLUMN "gender" "Gender";
ALTER TABLE "users" ADD COLUMN "nationality" TEXT;
ALTER TABLE "users" ADD COLUMN "residenceCountry" TEXT;
ALTER TABLE "users" ADD COLUMN "taxResidenceCountry" TEXT;
ALTER TABLE "users" ADD COLUMN "passportSignatureKey" TEXT;
ALTER TABLE "users" ADD COLUMN "schengenVisaKey" TEXT;
ALTER TABLE "users" ADD COLUMN "entryStampKey" TEXT;
ALTER TABLE "users" ADD COLUMN "exitStampKey" TEXT;
