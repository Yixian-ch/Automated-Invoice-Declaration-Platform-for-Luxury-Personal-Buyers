import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { ReservationModule } from '../reservation/reservation.module';
import { AutoReviewService } from './auto-review.service';

@Module({
  imports: [ConfigModule, PrismaModule, ReservationModule],
  providers: [AutoReviewService],
  exports: [AutoReviewService],
})
export class AutoReviewModule {}
