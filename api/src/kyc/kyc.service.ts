import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { KycStatus, KybStatus } from '@prisma/client';
import * as crypto from 'crypto';

/**
 * KYC/KYB module — integrates with Sumsub.
 * 
 * Flow:
 * 1. Frontend calls POST /kyc/session → this creates a Sumsub applicant + SDK token
 * 2. Frontend renders Sumsub Web SDK with the token
 * 3. Sumsub sends a webhook → POST /kyc/webhook → updates user KYC status
 */
@Injectable()
export class KycService {
  private readonly sumsubBaseUrl: string;
  private readonly appToken: string;
  private readonly secretKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.sumsubBaseUrl = config.get<string>('SUMSUB_BASE_URL') ?? 'https://api.sumsub.com';
    this.appToken = config.get<string>('SUMSUB_APP_TOKEN') ?? '';
    this.secretKey = config.get<string>('SUMSUB_SECRET_KEY') ?? '';
  }

  /**
   * Sign a Sumsub API request (HMAC-SHA256).
   * See: https://developers.sumsub.com/api-reference/#app-tokens
   */
  private signRequest(ts: number, method: string, path: string, body: string = '') {
    const data = `${ts}${method.toUpperCase()}${path}${body}`;
    return crypto.createHmac('sha256', this.secretKey).update(data).digest('hex');
  }

  private buildHeaders(method: string, path: string, body: string = '') {
    const ts = Math.floor(Date.now() / 1000);
    const signature = this.signRequest(ts, method, path, body);
    return {
      'X-App-Token': this.appToken,
      'X-App-Access-Sig': signature,
      'X-App-Access-Ts': String(ts),
      'Content-Type': 'application/json',
    };
  }

  /**
   * Create or retrieve Sumsub applicant and return an SDK access token.
   * levelName: 'basic-kyc-level' for KYC, 'basic-kyb-level' for KYB
   */
  async createSession(userId: string, levelName: string): Promise<{ token: string; userId: string }> {
    const externalUserId = userId;

    // 1. Create applicant
    const createPath = `/resources/applicants?levelName=${levelName}`;
    const createBody = JSON.stringify({ externalUserId });
    const createHeaders = this.buildHeaders('POST', createPath, createBody);

    const createRes = await fetch(`${this.sumsubBaseUrl}${createPath}`, {
      method: 'POST',
      headers: createHeaders,
      body: createBody,
    });
    const applicant = await createRes.json() as { id: string };

    // 2. Generate access token
    const tokenPath = `/resources/accessTokens?userId=${externalUserId}&levelName=${levelName}`;
    const tokenHeaders = this.buildHeaders('POST', tokenPath);
    const tokenRes = await fetch(`${this.sumsubBaseUrl}${tokenPath}`, {
      method: 'POST',
      headers: tokenHeaders,
    });
    const tokenData = await tokenRes.json() as { token: string; userId: string };

    // Store applicant ID on user
    const isKyb = levelName.includes('kyb');
    await this.prisma.user.update({
      where: { id: userId },
      data: isKyb
        ? { sumsubKybApplicantId: applicant.id, kybStatus: KybStatus.PENDING }
        : { sumsubKycApplicantId: applicant.id, kycStatus: KycStatus.PENDING },
    });

    return tokenData;
  }

  /**
   * Handle Sumsub webhook — validates HMAC signature, updates user status.
   */
  async handleWebhook(rawBody: string, signature: string): Promise<void> {
    // Verify webhook signature
    const expectedSig = crypto
      .createHmac('sha256', this.config.get<string>('SUMSUB_WEBHOOK_SECRET') ?? '')
      .update(rawBody)
      .digest('hex');

    if (expectedSig !== signature) {
      throw new BadRequestException('Invalid webhook signature');
    }

    const payload = JSON.parse(rawBody) as {
      type: string;
      externalUserId: string;
      reviewStatus: string;
      reviewResult?: { reviewAnswer: string };
      applicantType?: string;
    };

    const userId = payload.externalUserId;
    const answer = payload.reviewResult?.reviewAnswer;
    const isKyb = payload.applicantType === 'company';

    if (payload.type === 'applicantReviewed') {
      if (isKyb) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { kybStatus: answer === 'GREEN' ? KybStatus.APPROVED : KybStatus.FAILED },
        });
      } else {
        const newStatus = answer === 'GREEN' ? KycStatus.APPROVED : KycStatus.FAILED;
        await this.prisma.user.update({
          where: { id: userId },
          data: { kycStatus: newStatus },
        });
      }

      await this.prisma.auditLog.create({
        data: {
          action: isKyb ? 'KYB_STATUS_UPDATED' : 'KYC_STATUS_UPDATED',
          resourceType: 'User',
          resourceId: userId,
          userId,
          meta: { reviewAnswer: answer, type: payload.type },
        },
      });
    }
  }
}
