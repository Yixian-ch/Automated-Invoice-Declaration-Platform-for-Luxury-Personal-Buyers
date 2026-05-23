import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { InviteModule } from './invite/invite.module';
import { KycModule } from './kyc/kyc.module';
import { InvoiceModule } from './invoice/invoice.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    // Config — available globally
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // Rate limiting — 100 requests per minute per IP by default
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // Redis connection for Bull queues
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        redis: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
        },
      }),
      inject: [ConfigService],
    }),

    PrismaModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    InviteModule,
    KycModule,
    InvoiceModule,
    MailModule,
  ],
})
export class AppModule {}
