import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  async sendVerificationEmail(email: string): Promise<void> {
    this.logger.debug(`[MailService] Email sending disabled — skipped for ${email}`);
  }
}
