import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, UserRole } from '@prisma/client';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { members: { select: { id: true, firstName: true, lastName: true, email: true, role: true, status: true, kycStatus: true } } },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async create(data: Prisma.OrganizationCreateInput) {
    return this.prisma.organization.create({ data });
  }

  async listAll() {
    return this.prisma.organization.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, registrationNo: true, country: true, kybStatus: true, cashbackRate: true, createdAt: true },
    });
  }

  async updateCashbackRate(orgId: string, rate: number, actorId: string, actorRole: UserRole) {
    if (actorRole !== UserRole.ADMIN) throw new ForbiddenException();
    return this.prisma.organization.update({
      where: { id: orgId },
      data: { cashbackRate: rate },
    });
  }
}
