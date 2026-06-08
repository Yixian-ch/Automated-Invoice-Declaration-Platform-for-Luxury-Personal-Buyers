import { BadRequestException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export type ReconciliationRow = {
  merchant_name: string;
  invoice_date: string;
  invoices_total: string;
  bill_total: string;
  status: 'MATCH' | 'MISMATCH';
};

export type DrillDownRow = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  vendorName: string | null;
  purchaseDate: Date | null;
  grandTotalAmount: string | null;
  cashbackAmount: string | null;
  originalFilename: string | null;
  status: string;
};

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GROUP BY merchantName + date, compare SUM(grandTotalAmount) against merchant_bills.
   * Only APPROVED invoices are included.
   */
  async getReconciliation(): Promise<ReconciliationRow[]> {
    const rows = await this.prisma.$queryRaw<ReconciliationRow[]>`
      SELECT
        i."vendorName"                            AS merchant_name,
        DATE(i."purchaseDate")::text              AS invoice_date,
        SUM(i."grandTotalAmount")::text           AS invoices_total,
        mb."totalAmount"::text                    AS bill_total,
        CASE
          WHEN ABS(SUM(i."grandTotalAmount") - mb."totalAmount") < 0.01
          THEN 'MATCH'
          ELSE 'MISMATCH'
        END                                       AS status
      FROM invoices i
      JOIN merchant_bills mb
        ON i."vendorName" = mb."merchantName"
        AND DATE(i."purchaseDate") = mb.date
      WHERE i.status = 'APPROVED'
        AND i."vendorName" IS NOT NULL
        AND i."purchaseDate" IS NOT NULL
        AND i."grandTotalAmount" IS NOT NULL
      GROUP BY i."vendorName", DATE(i."purchaseDate"), mb."totalAmount"
      ORDER BY status DESC, DATE(i."purchaseDate") DESC
    `;
    return rows;
  }

  /**
   * Return all approved invoices for a specific merchant + date (drill-down).
   */
  async getDrillDown(merchantName: string, date: string): Promise<DrillDownRow[]> {
    const rows = await this.prisma.$queryRaw<DrillDownRow[]>`
      SELECT
        i.id,
        i."userId",
        u."firstName",
        u."lastName",
        u.email,
        i."vendorName",
        i."purchaseDate",
        i."grandTotalAmount"::text AS "grandTotalAmount",
        i."cashbackAmount"::text   AS "cashbackAmount",
        i."originalFilename",
        i.status
      FROM invoices i
      JOIN users u ON i."userId" = u.id
      WHERE i."vendorName" = ${merchantName}
        AND DATE(i."purchaseDate") = ${date}::date
        AND i.status = 'APPROVED'
      ORDER BY i."purchaseDate" DESC
    `;
    return rows;
  }

  /**
   * Upsert merchant bill entries (idempotent via unique constraint).
   */
  async importMerchantBills(
    bills: { merchantName: string; date: string; totalAmount: number }[],
  ) {
    const results = await Promise.all(
      bills.map((b) =>
        this.prisma.merchantBill.upsert({
          where: {
            merchantName_date: {
              merchantName: b.merchantName,
              date: new Date(b.date),
            },
          },
          update: { totalAmount: b.totalAmount },
          create: {
            merchantName: b.merchantName,
            date: new Date(b.date),
            totalAmount: b.totalAmount,
          },
        }),
      ),
    );
    return { imported: results.length };
  }

  /** List all merchant bills. */
  async listMerchantBills() {
    return this.prisma.merchantBill.findMany({ orderBy: { date: 'desc' } });
  }

  async listBuyerUsers() {
    return this.prisma.user.findMany({
      where: { role: UserRole.RESELLER },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        cashbackRate: true,
      },
      orderBy: { email: 'asc' },
    });
  }

  async updateUserCashbackRate(userId: string, cashbackRate: number) {
    if (typeof cashbackRate !== 'number' || Number.isNaN(cashbackRate)) {
      throw new BadRequestException('cashbackRate must be a number');
    }
    if (cashbackRate < 0 || cashbackRate > 1) {
      throw new BadRequestException('cashbackRate must be between 0 and 1');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { cashbackRate: cashbackRate.toString() },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        cashbackRate: true,
      },
    });
  }
}
