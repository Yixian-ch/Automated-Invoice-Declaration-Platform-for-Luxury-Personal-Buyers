import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from '@prisma/client';

export type ProfileDocumentType = 'passport' | 'business-license';

const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const EXTENSION_MIMES: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  png: 'image/png',
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  /** Return user without sensitive fields */
  sanitize(user: User): Omit<User, 'passwordHash' | 'refreshTokenHash' | 'emailVerificationToken' | 'passwordResetToken' | 'mfaSecret'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, refreshTokenHash, emailVerificationToken, passwordResetToken, mfaSecret, ...safe } = user;
    return safe;
  }

  async getProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { organization: { select: { id: true, name: true, kybStatus: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    if (dto.email) {
      const existing = await this.findByEmail(dto.email);
      if (existing && existing.id !== id) {
        throw new ConflictException('该邮箱已被其他账户使用');
      }
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: {
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          email: dto.email,
          address: dto.address,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: id,
          actorRole: updated.role,
          action: 'PROFILE_UPDATED',
          resourceType: 'User',
          resourceId: id,
          userId: id,
          meta: { fields: Object.keys(dto) },
        },
      });
      return updated;
    });

    return this.sanitize(user);
  }

  private documentField(type: ProfileDocumentType) {
    return type === 'passport' ? ('kycDocumentKey' as const) : ('kybDocumentKey' as const);
  }

  async saveDocument(id: string, type: ProfileDocumentType, buffer: Buffer, mimeType: string) {
    const ext = MIME_EXTENSIONS[mimeType];
    if (!ext) throw new BadRequestException('仅支持 PDF、JPEG 或 PNG 格式');

    const field = this.documentField(type);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { kycDocumentKey: true, kybDocumentKey: true, role: true },
    });

    // Replace any previous file (extension may differ)
    const oldKey = user[field];
    if (oldKey) this.storage.deleteFile(oldKey);

    const key = `user-${id}-${type}.${ext}`;
    this.storage.saveFile(key, buffer);

    await this.prisma.user.update({ where: { id }, data: { [field]: key } });
    await this.prisma.auditLog.create({
      data: {
        actorId: id,
        actorRole: user.role,
        action: 'PROFILE_DOCUMENT_UPLOADED',
        resourceType: 'User',
        resourceId: id,
        userId: id,
        meta: { type, key },
      },
    });

    return { type, uploaded: true };
  }

  async getDocument(id: string, type: ProfileDocumentType) {
    const field = this.documentField(type);
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id },
      select: { kycDocumentKey: true, kybDocumentKey: true },
    });
    const key = user[field];
    if (!key || !this.storage.fileExists(key)) {
      throw new NotFoundException('文档不存在');
    }
    const ext = key.split('.').pop() ?? '';
    return {
      path: this.storage.getFilePath(key),
      mimeType: EXTENSION_MIMES[ext] ?? 'application/octet-stream',
    };
  }
}
