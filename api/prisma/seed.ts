/**
 * Development seed — creates test accounts for every role.
 * Run: npm run prisma:seed
 *
 * All test passwords: Test1234!
 *
 * Accounts created:
 *   admin@lidp.dev          ADMIN         — platform administrator
 *   alice@lidp.dev          RESELLER
 *   bob@lidp.dev            RESELLER
 *   carol@lidp.dev          RESELLER
 *   dave@lidp.dev           RESELLER
 *   orgadmin@lidp.dev       ORG_ADMIN
 */

import { PrismaClient, UserRole, UserStatus, AccountType } from '@prisma/client';
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
    },
  });

  // ── Alice — reseller
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
    },
  });

  // ── Bob — self-registered reseller
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
    },
  });

  // ── Carol
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
      organizationId: org.id,
    },
  });

  // ── 合作商家(预约购物 / 小票匹配用,SIRET 取自样票)──────────────────────
  await prisma.merchant.upsert({
    where: { taxId: '53775858300059' },
    update: {},
    create: { taxId: '53775858300059', name: 'LA SAMARITAINE' },
  });

  console.log(`
✓ Seed complete — test accounts (password: ${PASSWORD})

  admin@lidp.dev      ADMIN          active
  alice@lidp.dev      RESELLER
  bob@lidp.dev        RESELLER
  carol@lidp.dev      RESELLER
  dave@lidp.dev       RESELLER       not started
  orgadmin@lidp.dev   ORG_ADMIN
`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
