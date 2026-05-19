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

  /** Authenticated reseller requests a Sumsub SDK session token */
  @UseGuards(JwtAuthGuard)
  @Post('session')
  startSession(
    @CurrentUser() user: { sub: string },
    @Body() dto: StartKycDto,
  ) {
    const levelName = dto.type === 'kyb' ? 'basic-kyb-level' : 'basic-kyc-level';
    return this.kycService.createSession(user.sub, levelName);
  }

  /** Sumsub webhook — no auth guard, signature verified in service */
  @Post('webhook')
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-payload-digest') signature: string,
  ) {
    if (!req.rawBody) throw new BadRequestException('Missing raw body');
    await this.kycService.handleWebhook(req.rawBody.toString(), signature);
    return { received: true };
  }
}
