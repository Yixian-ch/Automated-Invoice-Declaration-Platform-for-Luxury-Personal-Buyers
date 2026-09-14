import { Module } from '@nestjs/common';
import { SettlementService } from './settlement.service';
import { SettlementController } from './settlement.controller';
import { PayoutService } from './payout.service';

@Module({
  providers: [SettlementService, PayoutService],
  controllers: [SettlementController],
  exports: [SettlementService],
})
export class SettlementModule {}
