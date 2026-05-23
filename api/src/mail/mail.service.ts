import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    this.resend = new Resend(this.config.getOrThrow<string>('RESEND_API_KEY'));
    this.from = this.config.getOrThrow<string>('MAIL_FROM');
    this.appUrl = this.config.getOrThrow<string>('APP_URL');
  }

  async sendVerificationEmail(
    email: string,
    firstName: string,
    token: string,
  ): Promise<void> {
    const link = `${this.appUrl}/verify-email?token=${token}`;

    const { error } = await this.resend.emails.send({
      from: this.from,
      to: email,
      subject: 'Verify your LIDP account',
      html: this.verificationTemplate(firstName, link),
    });

    if (error) {
      this.logger.error(`Failed to send verification email to ${email}: ${JSON.stringify(error)}`);
      // Do not throw — registration already succeeded; user can request a resend later
    } else {
      this.logger.log(`Verification email sent to ${email}`);
    }
  }

  // ─── Templates ───────────────────────────────────────────────────────────────

  private verificationTemplate(firstName: string, link: string): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Verify your LIDP account</title>
</head>
<body style="margin:0;padding:0;background-color:#FAF9F7;font-family:Inter,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F7;padding:48px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border:1px solid #E8E4DE;padding:48px 40px;">
          <!-- Logo / Brand -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <p style="margin:0;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;color:#9A9189;">LIDP</p>
              <p style="margin:8px 0 0;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#C4B89A;">Luxury Invoice Declaration Platform</p>
            </td>
          </tr>
          <!-- Divider -->
          <tr><td align="center" style="padding-bottom:32px;"><div style="width:32px;height:1px;background:#B8966E;"></div></td></tr>
          <!-- Body -->
          <tr>
            <td style="color:#2C2A28;font-size:15px;line-height:1.7;padding-bottom:32px;">
              <p style="margin:0 0 16px;">Dear ${firstName},</p>
              <p style="margin:0 0 16px;">Thank you for registering with LIDP. Please verify your email address to activate your account.</p>
              <p style="margin:0;">This link expires in <strong>24 hours</strong>.</p>
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td align="center" style="padding-bottom:40px;">
              <a href="${link}" style="display:inline-block;background:#B8966E;color:#FFFFFF;text-decoration:none;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;padding:14px 36px;">
                Verify Email Address
              </a>
            </td>
          </tr>
          <!-- Fallback link -->
          <tr>
            <td style="font-size:12px;color:#9A9189;line-height:1.6;padding-bottom:32px;">
              <p style="margin:0 0 8px;">If the button does not work, copy and paste the link below into your browser:</p>
              <p style="margin:0;word-break:break-all;color:#B8966E;">${link}</p>
            </td>
          </tr>
          <!-- Footer -->
          <tr><td><div style="height:1px;background:#E8E4DE;margin-bottom:24px;"></div></td></tr>
          <tr>
            <td style="font-size:11px;color:#9A9189;line-height:1.6;">
              <p style="margin:0;">You are receiving this email because an account was created with this address on LIDP. If this was not you, you can safely ignore this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}
