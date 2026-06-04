import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const PRESIGNED_URL_EXPIRY_SECONDS = 300; // 5 minutes

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const region = this.config.get<string>('AWS_REGION', 'eu-west-3');
    this.bucket = this.config.get<string>('AWS_S3_BUCKET', '');

    this.client = new S3Client({
      region,
      credentials: {
        accessKeyId: this.config.get<string>('AWS_ACCESS_KEY_ID', ''),
        secretAccessKey: this.config.get<string>('AWS_SECRET_ACCESS_KEY', ''),
      },
    });
  }

  getBucketName(): string {
    return this.bucket;
  }

  /**
   * Generate a presigned PUT URL allowing the client to upload directly to S3.
   * The URL expires in 5 minutes.
   */
  async getPresignedUploadUrl(
    key: string,
    mimeType: string,
    maxBytes: number = 10 * 1024 * 1024, // 10 MB default
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: mimeType,
        // Server-side encryption at rest
        ServerSideEncryption: 'AES256',
        // Metadata for auditing
        Metadata: {
          'upload-client': 'lidp-frontend',
        },
      });

      const url = await getSignedUrl(this.client, command, {
        expiresIn: PRESIGNED_URL_EXPIRY_SECONDS,
      });

      return url;
    } catch (err) {
      this.logger.error('Failed to generate presigned URL', err);
      throw new InternalServerErrorException('Could not prepare upload URL');
    }
  }

  /**
   * Hard-delete an object from S3 (used on invoice rejection / GDPR erasure).
   */
  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err) {
      this.logger.error(`Failed to delete S3 object ${key}`, err);
      // Non-fatal — caller can retry or flag for manual cleanup
    }
  }

  /**
   * Build the canonical S3 key for a user invoice upload.
   * Pattern: invoices/{userId}/{invoiceId}/{filename}
   */
  buildInvoiceKey(userId: string, invoiceId: string, filename: string): string {
    const sanitised = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `invoices/${userId}/${invoiceId}/${sanitised}`;
  }

  /**
   * Build the canonical S3 key for a KYC document upload.
   * Pattern: kyc/{userId}/{uploadId}/{filename}
   */
  buildKycKey(userId: string, uploadId: string, filename: string): string {
    const sanitised = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    return `kyc/${userId}/${uploadId}/${sanitised}`;
  }
}
