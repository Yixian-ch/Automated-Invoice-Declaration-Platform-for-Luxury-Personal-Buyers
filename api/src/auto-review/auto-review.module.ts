import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AutoReviewService } from './auto-review.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [AutoReviewService],
  exports: [AutoReviewService],
})
export class AutoReviewModule {}
