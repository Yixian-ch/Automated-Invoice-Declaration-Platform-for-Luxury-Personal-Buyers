import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { KycStatus, KybStatus, UserRole } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { StorageService } from '../storage/storage.service';

/**
 * KYC/KYB module — simplified manual review flow.
 *
 * Flow:
 * 1. Frontend calls POST /kyc/session with file metadata → backend returns a presigned PUT URL
 * 2. Frontend uploads passport file directly to S3 (or local dev sink)
 * 3. Frontend calls POST /kyc/confirm with the `s3Key` → backend sets `kycStatus` to PENDING and stores the key
 * 4. Admin reviews in the dashboard and calls approve/reject endpoints
 */
@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly bypassKyc: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {
    this.bypassKyc =
      config.get<string>('NODE_ENV') !== 'production' &&
      config.get<string>('BYPASS_KYC') === 'true';
  }

  /** Create a presigned PUT URL for a KYC document upload */
  async createUploadUrl(userId: string, originalFilename: string, mimeType: string) {
    const uploadId = uuidv4();
    const bypassS3 =
      this.config.get<string>('NODE_ENV') !== 'production' &&
      this.config.get<string>('BYPASS_S3') === 'true';

    const s3Key = bypassS3
      ? `dev/bypass/kyc/${userId}/${uploadId}`
      : this.storage.buildKycKey(userId, uploadId, originalFilename);

    const presignedUrl = bypassS3
      ? `${this.config.get<string>('API_URL', 'http://localhost:3001')}/api/v1/kyc/${uploadId}/dev-sink`
      : await this.storage.getPresignedUploadUrl(s3Key, mimeType);

    return { uploadId, presignedUrl, s3Key };
  }

  /** Confirm that the KYC document has been uploaded and mark for manual review */
  async confirmUpload(userId: string, s3Key: string) {
    const newStatus = this.bypassKyc ? KycStatus.APPROVED : KycStatus.PENDING;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        kycDocumentKey: s3Key,
        kycStatus: newStatus,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        action: this.bypassKyc ? 'KYC_AUTO_APPROVED' : 'KYC_UPLOAD_CONFIRMED',
        resourceType: 'User',
        resourceId: userId,
        userId,
        meta: { s3Key },
      },
    });
    this.logger.log(`KYC upload confirmed for user ${userId} — status: ${newStatus}`);
  }

  /** Admin approves KYC */
  async approve(adminId: string, userId: string, note?: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { kycStatus: KycStatus.APPROVED } });
      await tx.auditLog.create({
        data: {
          action: 'KYC_APPROVED',
          resourceType: 'User',
          resourceId: userId,
          userId: adminId,
          meta: { note },
        },
      });
    });
  }

  /** Admin rejects KYC */
  async reject(adminId: string, userId: string, note?: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { kycStatus: KycStatus.FAILED } });
      await tx.auditLog.create({
        data: {
          action: 'KYC_REJECTED',
          resourceType: 'User',
          resourceId: userId,
          userId: adminId,
          meta: { note },
        },
      });
    });
  }
}
