/**
 * Development seed — creates test accounts for every role and KYC state.
 * Run: npm run prisma:seed
 *
 * All test passwords: Test1234!
 *
 * Accounts created:
 *   admin@lidp.dev          ADMIN         — platform administrator
 *   alice@lidp.dev          RESELLER      — invite-registered, KYC APPROVED
 *   bob@lidp.dev            RESELLER      — self-registered, KYC PENDING
 *   carol@lidp.dev          RESELLER      — self-registered, KYC + KYB APPROVED
 *   dave@lidp.dev           RESELLER      — fresh, KYC NOT_STARTED
 *   orgadmin@lidp.dev       ORG_ADMIN     — org admin, KYC APPROVED
 */

import { PrismaClient, UserRole, UserStatus, AccountType, KycStatus, KybStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const PASSWORD = 'Test1234!';

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 12);
  const now = new Date();

  // ── Organisation ────────────────────────────────────────────────────────────
  let org = await prisma.organization.findFirst({
    where: { registrationNo: 'FR123456789' },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: {
        name: 'Acme Luxury SAS',
        registrationNo: 'FR123456789',
        country: 'FR',
        kybStatus: KybStatus.APPROVED,
      },
    });
  }

  // ── Admin ───────────────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { email: 'admin@lidp.dev' },
    update: {},
    create: {
      email: 'admin@lidp.dev',
      passwordHash: hash,
      firstName: 'Admin',
      lastName: 'LIDP',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      accountType: AccountType.INDIVIDUAL,
      kycStatus: KycStatus.APPROVED,
      kybStatus: KybStatus.NOT_STARTED,
      emailVerifiedAt: now,
      registeredViaInvite: false,
    },
  });

  // ── Alice — invite-registered reseller, KYC approved ───────────────────────
  await prisma.user.upsert({
    where: { email: 'alice@lidp.dev' },
    update: {},
    create: {
      email: 'alice@lidp.dev',
      passwordHash: hash,
      firstName: 'Alice',
      lastName: 'Dupont',
      role: UserRole.RESELLER,
      status: UserStatus.ACTIVE,
      accountType: AccountType.INDIVIDUAL,
      kycStatus: KycStatus.APPROVED,
      kybStatus: KybStatus.NOT_STARTED,
      emailVerifiedAt: now,
      registeredViaInvite: true,
    },
  });

  // ── Bob — self-registered reseller, KYC pending ─────────────────────────────
  await prisma.user.upsert({
    where: { email: 'bob@lidp.dev' },
    update: {},
    create: {
      email: 'bob@lidp.dev',
      passwordHash: hash,
      firstName: 'Bob',
      lastName: 'Martin',
      role: UserRole.RESELLER,
      status: UserStatus.REGISTERED,
      accountType: AccountType.INDIVIDUAL,
      kycStatus: KycStatus.PENDING,
      kybStatus: KybStatus.PENDING,
      diditKycSessionId: 'seed-pending-kyc',
      diditKybSessionId: 'seed-pending-kyb',
      emailVerifiedAt: now,
      registeredViaInvite: false,
    },
  });

  // ── Carol — self-registered, KYC + KYB both approved ───────────────────────
  await prisma.user.upsert({
    where: { email: 'carol@lidp.dev' },
    update: {},
    create: {
      email: 'carol@lidp.dev',
      passwordHash: hash,
      firstName: 'Carol',
      lastName: 'Leroy',
      role: UserRole.RESELLER,
      status: UserStatus.ACTIVE,
      accountType: AccountType.INDIVIDUAL,
      kycStatus: KycStatus.APPROVED,
      kybStatus: KybStatus.APPROVED,
      emailVerifiedAt: now,
      registeredViaInvite: false,
    },
  });

  // ── Dave — fresh reseller, nothing started ──────────────────────────────────
  await prisma.user.upsert({
    where: { email: 'dave@lidp.dev' },
    update: {},
    create: {
      email: 'dave@lidp.dev',
      passwordHash: hash,
      firstName: 'Dave',
      lastName: 'Nguyen',
      role: UserRole.RESELLER,
      status: UserStatus.REGISTERED,
      accountType: AccountType.INDIVIDUAL,
      kycStatus: KycStatus.NOT_STARTED,
      kybStatus: KybStatus.NOT_STARTED,
      emailVerifiedAt: now,
      registeredViaInvite: false,
    },
  });

  // ── Org admin ────────────────────────────────────────────────────────────────
  await prisma.user.upsert({
    where: { email: 'orgadmin@lidp.dev' },
    update: {},
    create: {
      email: 'orgadmin@lidp.dev',
      passwordHash: hash,
      firstName: 'Org',
      lastName: 'Admin',
      role: UserRole.ORG_ADMIN,
      status: UserStatus.ACTIVE,
      accountType: AccountType.ORGANIZATION,
      kycStatus: KycStatus.APPROVED,
      kybStatus: KybStatus.APPROVED,
      emailVerifiedAt: now,
      registeredViaInvite: false,
      organizationId: org.id,
    },
  });

  console.log(`
✓ Seed complete — test accounts (password: ${PASSWORD})

  admin@lidp.dev      ADMIN          active
  alice@lidp.dev      RESELLER       KYC approved  (invite-registered)
  bob@lidp.dev        RESELLER       KYC+KYB pending (self-registered)
  carol@lidp.dev      RESELLER       KYC+KYB approved (self-registered)
  dave@lidp.dev       RESELLER       not started
  orgadmin@lidp.dev   ORG_ADMIN      KYC+KYB approved / org: ${org.name}
`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
