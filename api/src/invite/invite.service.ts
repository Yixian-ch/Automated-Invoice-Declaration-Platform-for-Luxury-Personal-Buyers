import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { InviteCodeStatus, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class InviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private generateCode(): string {
    // 12 random bytes → 24 hex chars, grouped as XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
    const hex = randomBytes(12).toString('hex').toUpperCase();
    return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 24)}`;
  }

  async create(
    creatorId: string,
    creatorRole: UserRole,
    dto: CreateInviteDto,
  ) {
    // Org admins can only create reseller invites for their own org
    if (creatorRole === UserRole.ORG_ADMIN) {
      const creator = await this.prisma.user.findUnique({ where: { id: creatorId } });
      if (!creator?.organizationId) throw new ForbiddenException();
      if (dto.intendedOrgId && dto.intendedOrgId !== creator.organizationId) {
        throw new ForbiddenException('Cannot create invites for another organization');
      }
      dto.intendedOrgId = creator.organizationId;
      if (dto.intendedRole !== UserRole.RESELLER) {
        throw new ForbiddenException('Org admins can only create reseller invites');
      }
    }

    const defaultExpiry = this.config.get<number>('INVITE_CODE_EXPIRY_HOURS') ?? 72;
    const hours = dto.expiryHours ?? Number(defaultExpiry);
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);

    const invite = await this.prisma.inviteCode.create({
      data: {
        code: this.generateCode(),
        intendedRole: dto.intendedRole,
        intendedOrgId: dto.intendedOrgId ?? null,
        createdByUserId: creatorId,
        expiresAt,
        status: InviteCodeStatus.ACTIVE,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: creatorId,
        actorRole: creatorRole,
        action: 'INVITE_CODE_CREATED',
        resourceType: 'InviteCode',
        resourceId: invite.id,
        userId: creatorId,
        organizationId: dto.intendedOrgId ?? undefined,
      },
    });

    return invite;
  }

  async revoke(inviteId: string, actorId: string) {
    const invite = await this.prisma.inviteCode.findUnique({ where: { id: inviteId } });
    if (!invite) throw new NotFoundException('Invite not found');
    if (invite.status !== InviteCodeStatus.ACTIVE) {
      throw new ForbiddenException('Invite is not active');
    }
    return this.prisma.inviteCode.update({
      where: { id: inviteId },
      data: { status: InviteCodeStatus.REVOKED },
    });
  }

  async listByOrg(orgId: string) {
    return this.prisma.inviteCode.findMany({
      where: { intendedOrgId: orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listAll() {
    return this.prisma.inviteCode.findMany({
      orderBy: { createdAt: 'desc' },
      include: { organization: { select: { name: true } } },
    });
  }
}
