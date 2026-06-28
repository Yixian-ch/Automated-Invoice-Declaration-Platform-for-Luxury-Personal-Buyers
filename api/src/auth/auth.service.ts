import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole, UserStatus, AccountType } from '@prisma/client';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone ?? null,
          locale: dto.locale ?? 'zh',
          role: UserRole.RESELLER,
          accountType: AccountType.INDIVIDUAL,
          status: UserStatus.REGISTERED,
          emailVerifiedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: newUser.id,
          actorRole: newUser.role,
          action: 'USER_SELF_REGISTERED',
          resourceType: 'User',
          resourceId: newUser.id,
          userId: newUser.id,
        },
      });
    });

    return { message: '注册成功' };
  }

  async login(dto: LoginDto, ip?: string) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || user.deletedAt) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.role);

    const refreshTokenHash = await bcrypt.hash(refreshToken, BCRYPT_ROUNDS);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash, lastLoginAt: new Date(), lastLoginIp: ip ?? null },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: user.id,
        actorRole: user.role,
        action: 'USER_LOGIN',
        resourceType: 'User',
        resourceId: user.id,
        userId: user.id,
        ipAddress: ip ?? null,
      },
    });

    return { accessToken, refreshToken, user: this.usersService.sanitize(user) };
  }

  async refresh(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshTokenHash || user.deletedAt) throw new UnauthorizedException();

    const valid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!valid) throw new UnauthorizedException('Refresh token invalid or expired');

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    const newHash = await bcrypt.hash(tokens.refreshToken, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: newHash } });

    return tokens;
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'USER_LOGOUT',
        resourceType: 'User',
        resourceId: userId,
        userId,
      },
    });
    return { message: 'Logged out' };
  }

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_SECRET')!,
        expiresIn: (this.config.get<string>('JWT_EXPIRY') ?? '15m') as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET')!,
        expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRY') ?? '7d') as any,
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
