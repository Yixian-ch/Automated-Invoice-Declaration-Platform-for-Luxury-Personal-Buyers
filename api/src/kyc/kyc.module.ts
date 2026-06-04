import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { KycService } from './kyc.service';
import { KycController } from './kyc.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [ConfigModule, StorageModule],
  providers: [KycService],
  controllers: [KycController],
})
export class KycModule {}
