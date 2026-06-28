import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { InvoiceController } from './invoice.controller';
import { InvoiceService, OCR_QUEUE } from './invoice.service';
import { StorageModule } from '../storage/storage.module';
import { OcrModule } from '../ocr/ocr.module';
import { OcrProcessor } from '../ocr/ocr.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { CashbackModule } from '../cashback/cashback.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    StorageModule,
    OcrModule,
    CashbackModule,
    BullModule.registerQueueAsync({
      name: OCR_QUEUE,
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        if (redisUrl) return { url: redisUrl };
        return {
          redis: {
            host: config.get<string>('REDIS_HOST', 'localhost'),
            port: config.get<number>('REDIS_PORT', 6379),
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService, OcrProcessor],
  exports: [InvoiceService],
})
export class InvoiceModule {}
