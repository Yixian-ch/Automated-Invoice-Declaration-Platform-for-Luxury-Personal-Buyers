import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

export interface BrandRuleDto {
  id?: string;
  displayLabel: string;
  brands: string[];
  rate: number;
  condition?: string;
  sortOrder?: number;
}

export interface UpdateMerchantDto {
  displayName?: string;
  matchKeywords?: string[];
  defaultRate?: number;
  notes?: string;
}

@Injectable()
export class CashbackConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.merchantCashbackConfig.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        brandRules: { orderBy: { sortOrder: 'asc' } },
      },
    });
  }

  async updateMerchant(merchantId: string, dto: UpdateMerchantDto) {
    return this.prisma.merchantCashbackConfig.update({
      where: { id: merchantId },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.matchKeywords !== undefined && { matchKeywords: dto.matchKeywords }),
        ...(dto.defaultRate !== undefined && { defaultRate: dto.defaultRate }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: { brandRules: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  /** Replace all brand rules for a merchant in one transaction. */
  async replaceBrandRules(merchantId: string, rules: BrandRuleDto[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.brandCashbackRule.deleteMany({ where: { merchantId } });

      const created = await Promise.all(
        rules.map((rule, i) =>
          tx.brandCashbackRule.create({
            data: {
              merchantId,
              displayLabel: rule.displayLabel,
              brands: rule.brands.map((b) => b.toLowerCase().trim()),
              rate: rule.rate,
              condition: rule.condition ?? null,
              sortOrder: rule.sortOrder ?? i,
            },
          }),
        ),
      );

      return tx.merchantCashbackConfig.findUnique({
        where: { id: merchantId },
        include: { brandRules: { orderBy: { sortOrder: 'asc' } } },
      });
    });
  }
}
