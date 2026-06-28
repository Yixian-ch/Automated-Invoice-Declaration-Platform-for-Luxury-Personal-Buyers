import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { InvoiceModule } from './invoice/invoice.module';
import { MailModule } from './mail/mail.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    // Config — available globally
    ConfigModule.forRoot({
      isGlobal: true,
      // Priority (highest → lowest):
      //   .env.development.local / .env.production.local  (personal, gitignored)
      //   .env.development        / .env.production        (committed, env-specific)
      //   .env.local                                       (personal, gitignored)
      //   .env                                             (committed, shared defaults)
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'production'}.local`,
        `.env.${process.env.NODE_ENV ?? 'production'}`,
        '.env.local',
        '.env',
      ],
    }),

    // Rate limiting — 100 requests per minute per IP by default
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // Redis connection for Bull queues
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        
        // 🔥 如果 Railway 环境变量里配置了完整的 REDIS_URL，直接用它连接（包含密码和主机名）
        if (redisUrl) {
          return { url: redisUrl };
        }
        
        // 💡 否则降级使用本地开发模式
        return {
          redis: {
            host: config.get<string>('REDIS_HOST', 'localhost'),
            port: config.get<number>('REDIS_PORT', 6379),
          },
        };
      },
      inject: [ConfigService],
    }),

    PrismaModule,
    AuthModule,
    UsersModule,
    InvoiceModule,
    MailModule,
    AdminModule,
  ],
})
export class AppModule {}
