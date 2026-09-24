import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeSiret } from './siret';
import type { CreateMerchantDto, UpdateMerchantDto } from './dto/merchant.dto';

@Injectable()
export class MerchantService {
  constructor(private readonly prisma: PrismaService) {}

  /** 买手端下拉列表:只返回启用的商家 */
  listActive() {
    return this.prisma.merchant.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  /** 后台:全部商家(含停用) */
  listAll() {
    return this.prisma.merchant.findMany({
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { reservations: true } } },
    });
  }

  async create(dto: CreateMerchantDto) {
    const taxId = this.requireValidSiret(dto.taxId);
    const dup = await this.prisma.merchant.findUnique({ where: { taxId } });
    if (dup) throw new ConflictException(`税号 ${taxId} 已存在(${dup.name})`);
    return this.prisma.merchant.create({
      data: { name: dto.name.trim(), taxId },
    });
  }

  async update(id: string, dto: UpdateMerchantDto) {
    const existing = await this.prisma.merchant.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('商家不存在');

    const data: { name?: string; taxId?: string; active?: boolean } = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.taxId !== undefined) {
      const taxId = this.requireValidSiret(dto.taxId);
      if (taxId !== existing.taxId) {
        const dup = await this.prisma.merchant.findUnique({ where: { taxId } });
        if (dup) throw new ConflictException(`税号 ${taxId} 已存在(${dup.name})`);
        data.taxId = taxId;
      }
    }
    return this.prisma.merchant.update({ where: { id }, data });
  }

  private requireValidSiret(raw: string): string {
    const siret = normalizeSiret(raw);
    if (!siret) {
      throw new BadRequestException('税号必须是 14 位数字且通过 SIRET 校验(Luhn)');
    }
    return siret;
  }
}
