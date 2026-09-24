import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ReservationService } from './reservation.service';
import { MerchantService } from './merchant.service';
import { ReservationController } from './reservation.controller';
import { ReservationAdminController } from './reservation-admin.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ReservationController, ReservationAdminController],
  providers: [ReservationService, MerchantService],
  exports: [ReservationService, MerchantService],
})
export class ReservationModule {}
