import { Controller, Post, Body, UseGuards, Req, Headers, BadRequestException } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { KycService } from './kyc.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IsString, IsIn } from 'class-validator';

class StartKycDto {
  @IsString()
  @IsIn(['kyc', 'kyb'])
  type: 'kyc' | 'kyb';
}

@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  /** Authenticated reseller requests a Didit verification session URL */
  @UseGuards(JwtAuthGuard)
  @Post('session')
  startSession(
    @CurrentUser() user: { sub: string },
    @Body() dto: StartKycDto,
  ) {
    return this.kycService.createSession(user.sub, dto.type);
  }

  /** Didit webhook — no auth guard, signature verified inside service */
  @Post('webhook')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signature-v2') signatureV2: string,
    @Headers('x-timestamp') timestamp: string,
  ) {
    if (!req.rawBody) throw new BadRequestException('Missing raw body');
    await this.kycService.handleWebhook(req.rawBody.toString(), signatureV2, timestamp);
    return { received: true };
  }
}

