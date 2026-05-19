import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { InviteModule } from './invite/invite.module';
import { KycModule } from './kyc/kyc.module';

@Module({
  imports: [
    // Config — available globally
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),

    // Rate limiting — 100 requests per minute per IP by default
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    PrismaModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    InviteModule,
    KycModule,
  ],
})
export class AppModule {}
