import {
  Controller,
  Get,
  Put,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '@prisma/client';
import { CashbackConfigService } from './cashback-config.service.js';
import type { BrandRuleDto, UpdateMerchantDto } from './cashback-config.service.js';
import { CashbackService } from './cashback.service.js';

@Controller('admin/cashback-configs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class CashbackConfigController {
  constructor(
    private readonly configService: CashbackConfigService,
    private readonly cashbackService: CashbackService,
  ) {}

  @Get()
  findAll() {
    return this.configService.findAll();
  }

  @Put(':merchantId')
  async updateMerchant(
    @Param('merchantId') merchantId: string,
    @Body() dto: UpdateMerchantDto,
  ) {
    const result = await this.configService.updateMerchant(merchantId, dto);
    this.cashbackService.invalidateCache();
    return result;
  }

  @Put(':merchantId/brand-rules')
  async replaceBrandRules(
    @Param('merchantId') merchantId: string,
    @Body() rules: BrandRuleDto[],
  ) {
    const result = await this.configService.replaceBrandRules(merchantId, rules);
    this.cashbackService.invalidateCache();
    return result;
  }
}
