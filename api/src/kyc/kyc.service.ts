import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { KycStatus, KybStatus } from '@prisma/client';
import * as crypto from 'crypto';

const DIDIT_API = 'https://verification.didit.me';

/**
 * KYC/KYB module — integrates with Didit (https://didit.me).
 *
 * Flow:
 * 1. Frontend calls POST /kyc/session → backend creates a Didit session
 *    and returns { sessionId, url } (the hosted verification URL on verify.didit.me)
 * 2. Frontend embeds the URL in an iframe — Didit handles document capture,
 *    liveness, and face match natively
 * 3. Didit sends a webhook → POST /kyc/webhook → updates user KYC/KYB status
 */
@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly apiKey: string;
  private readonly kycWorkflowId: string;
  private readonly kybWorkflowId: string;
  private readonly webhookSecret: string;
  private readonly appUrl: string;

  private readonly bypassKyc: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.bypassKyc =
      config.get<string>('NODE_ENV') !== 'production' &&
      config.get<string>('BYPASS_KYC') === 'true';

    if (this.bypassKyc) {
      // In bypass mode Didit credentials are not required
      this.apiKey = '';
      this.kycWorkflowId = '';
      this.kybWorkflowId = '';
      this.webhookSecret = '';
    } else {
      this.apiKey = config.getOrThrow<string>('DIDIT_API_KEY');
      this.kycWorkflowId = config.getOrThrow<string>('DIDIT_KYC_WORKFLOW_ID');
      this.kybWorkflowId = config.getOrThrow<string>('DIDIT_KYB_WORKFLOW_ID');
      this.webhookSecret = config.getOrThrow<string>('DIDIT_WEBHOOK_SECRET');
    }
    this.appUrl = config.get<string>('APP_URL') ?? 'http://localhost:3000';
  }

  // ─── Session creation ───────────────────────────────────────────────────────

  async createSession(
    userId: string,
    type: 'kyc' | 'kyb',
  ): Promise<{ sessionId: string; url: string }> {
    // ── Dev bypass ────────────────────────────────────────────────────────────
    if (this.bypassKyc) {
      this.logger.warn(`[DEV] BYPASS_KYC active — auto-approving ${type} for userId=${userId}`);
      if (type === 'kyb') {
        await this.prisma.user.update({
          where: { id: userId },
          data: { diditKybSessionId: 'dev-bypass', kybStatus: KybStatus.APPROVED },
        });
      } else {
        await this.prisma.user.update({
          where: { id: userId },
          data: { diditKycSessionId: 'dev-bypass', kycStatus: KycStatus.APPROVED },
        });
      }
      return { sessionId: 'dev-bypass', url: '__bypass__' };
    }

    // ── Real Didit session ────────────────────────────────────────────────────
    const workflowId = type === 'kyb' ? this.kybWorkflowId : this.kycWorkflowId;
    const callback = `${this.appUrl}/onboarding/complete`;

    const res = await fetch(`${DIDIT_API}/v3/session/`, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: workflowId,
        vendor_data: userId,
        callback,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      this.logger.error(`Didit session creation failed: ${res.status} ${errorText}`);
      throw new BadRequestException('Failed to create verification session');
    }

    const data = await res.json() as {
      session_id: string;
      url: string;
      status: string;
    };

    // Persist session ID only — status stays NOT_STARTED until Didit webhook fires
    if (type === 'kyb') {
      await this.prisma.user.update({
        where: { id: userId },
        data: { diditKybSessionId: data.session_id },
      });
    } else {
      await this.prisma.user.update({
        where: { id: userId },
        data: { diditKycSessionId: data.session_id },
      });
    }

    return { sessionId: data.session_id, url: data.url };
  }

  // ─── Webhook handling ───────────────────────────────────────────────────────

  /**
   * Verify Didit X-Signature-V2 and process status.updated events.
   * V2 signs: JSON.stringify(sortKeys(shortenFloats(parsed_body))) with HMAC-SHA256
   */
  async handleWebhook(
    rawBody: string,
    signatureV2: string,
    timestamp: string,
  ): Promise<void> {
    // 1. Replay protection — reject if > 5 minutes old
    const ts = Number(timestamp);
    if (!ts || Math.abs(Date.now() / 1000 - ts) > 300) {
      throw new BadRequestException('Webhook timestamp out of range');
    }

    // 2. Canonical V2 signature verification
    const parsed: unknown = JSON.parse(rawBody);
    const canonical = JSON.stringify(sortKeys(shortenFloats(parsed)));
    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(canonical, 'utf8')
      .digest('hex');

    const sigOk =
      signatureV2.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureV2));

    if (!sigOk) {
      throw new BadRequestException('Invalid webhook signature');
    }

    // 3. Dispatch
    const event = parsed as {
      webhook_type: string;
      session_id: string;
      status: string;
      vendor_data: string;
    };

    if (event.webhook_type !== 'status.updated') return; // ignore other events

    const userId = event.vendor_data;
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      this.logger.warn(`Didit webhook: unknown vendor_data userId=${userId}`);
      return;
    }

    const isKyb = user.diditKybSessionId === event.session_id;
    const newStatus = mapDigitStatus(event.status);

    if (newStatus === null) return; // in-flight status, no DB update needed

    await this.prisma.$transaction(async (tx) => {
      if (isKyb) {
        await tx.user.update({ where: { id: userId }, data: { kybStatus: newStatus as KybStatus } });
      } else {
        await tx.user.update({ where: { id: userId }, data: { kycStatus: newStatus as KycStatus } });
      }
      await tx.auditLog.create({
        data: {
          action: isKyb ? 'KYB_STATUS_UPDATED' : 'KYC_STATUS_UPDATED',
          resourceType: 'User',
          resourceId: userId,
          userId,
          meta: { diditStatus: event.status, sessionId: event.session_id },
        },
      });
    });

    this.logger.log(
      `Didit webhook: userId=${userId} ${isKyb ? 'kyb' : 'kyc'} → ${event.status}`,
    );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map Didit status string → our KycStatus / KybStatus enum value, or null to skip */
function mapDigitStatus(status: string): KycStatus | KybStatus | null {
  switch (status) {
    case 'Approved':      return KycStatus.APPROVED;
    case 'Declined':      return KycStatus.FAILED;
    case 'In Review':     return KycStatus.PENDING;
    case 'Resubmitted':   return KycStatus.PENDING;
    default:              return null; // Not Started / In Progress / Awaiting User / Abandoned / Expired
  }
}

/** Convert whole-number floats to integers (Didit V2 canonicalization). */
function shortenFloats(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(shortenFloats);
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, shortenFloats(x)]),
    );
  }
  if (typeof v === 'number' && !Number.isInteger(v) && v % 1 === 0) return Math.trunc(v);
  return v;
}

/** Recursively sort object keys (arrays preserved in order). */
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    return Object.keys(v as object)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => {
        acc[k] = sortKeys((v as Record<string, unknown>)[k]);
        return acc;
      }, {});
  }
  return v;
}
