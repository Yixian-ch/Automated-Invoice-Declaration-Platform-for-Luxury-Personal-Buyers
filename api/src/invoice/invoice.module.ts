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
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [InvoiceController],
  providers: [InvoiceService, OcrProcessor, ConfigService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
