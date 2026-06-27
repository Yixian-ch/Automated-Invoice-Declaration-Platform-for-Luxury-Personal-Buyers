import { Module } from '@nestjs/common';
import { CashbackService } from './cashback.service.js';
import { CashbackConfigService } from './cashback-config.service.js';
import { CashbackConfigController } from './cashback-config.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [CashbackConfigController],
  providers: [CashbackService, CashbackConfigService],
  exports: [CashbackService],
})
export class CashbackModule {}
