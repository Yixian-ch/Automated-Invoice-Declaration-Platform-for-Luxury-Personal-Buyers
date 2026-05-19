import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserStatus, InviteCodeStatus } from '@prisma/client';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Registration ────────────────────────────────────────────────────────────

  async register(dto: RegisterDto) {
    // 1. Validate invite code
    const invite = await this.prisma.inviteCode.findUnique({
      where: { code: dto.inviteCode },
      include: { organization: true },
    });
    if (!invite) throw new NotFoundException('Invalid invite code');
    if (invite.status !== InviteCodeStatus.ACTIVE) {
      throw new BadRequestException('Invite code is no longer valid');
    }
    if (invite.expiresAt < new Date()) {
      await this.prisma.inviteCode.update({
        where: { id: invite.id },
        data: { status: InviteCodeStatus.EXPIRED },
      });
      throw new BadRequestException('Invite code has expired');
    }

    // 2. Check email uniqueness
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    // 3. Hash password
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const emailVerificationToken = uuidv4();

    // 4. Create user
    const user = await this.prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
          locale: dto.locale ?? 'fr',
          role: invite.intendedRole,
          status: UserStatus.REGISTERED,
          emailVerificationToken,
          organizationId: invite.intendedOrgId ?? undefined,
        },
      });

      // Mark invite as used
      await tx.inviteCode.update({
        where: { id: invite.id },
        data: {
          status: InviteCodeStatus.USED,
          usedByUserId: newUser.id,
          usedAt: new Date(),
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          actorId: newUser.id,
          actorRole: newUser.role,
          action: 'USER_REGISTERED',
          resourceType: 'User',
          resourceId: newUser.id,
          userId: newUser.id,
          organizationId: invite.intendedOrgId ?? undefined,
        },
      });

      return newUser;
    });

    // TODO: Send verification email with emailVerificationToken (Phase 5)

    return { message: 'Registration successful. Please verify your email.' };
  }

  // ─── Email Verification ───────────────────────────────────────────────────────

  async verifyEmail(token: string) {
    const user = await this.usersService.findByEmailVerificationToken(token);
    if (!user) throw new BadRequestException('Invalid or expired verification token');
    if (user.emailVerifiedAt) return { message: 'Email already verified' };

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date(), emailVerificationToken: null },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorRole: user.role,
          action: 'EMAIL_VERIFIED',
          resourceType: 'User',
          resourceId: user.id,
          userId: user.id,
        },
      });
    });

    return { message: 'Email verified successfully' };
  }

  // ─── Login ────────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, ip?: string) {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || user.deletedAt) throw new UnauthorizedException('Invalid credentials');

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) throw new UnauthorizedException('Invalid credentials');

    if (!user.emailVerifiedAt) {
      throw new UnauthorizedException('Please verify your email before logging in');
    }

    const { accessToken, refreshToken } = await this.generateTokens(user.id, user.email, user.role);

    // Store hashed refresh token
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

  // ─── Refresh ──────────────────────────────────────────────────────────────────

  async refresh(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshTokenHash || user.deletedAt) {
      throw new UnauthorizedException();
    }
    const valid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!valid) throw new UnauthorizedException('Refresh token invalid or expired');

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    const newHash = await bcrypt.hash(tokens.refreshToken, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: user.id }, data: { refreshTokenHash: newHash } });

    return tokens;
  }

  // ─── Logout ───────────────────────────────────────────────────────────────────

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

  // ─── Token helpers ────────────────────────────────────────────────────────────

  private async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_SECRET')!,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expiresIn: (this.config.get<string>('JWT_EXPIRY') ?? '15m') as any,
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET')!,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expiresIn: (this.config.get<string>('JWT_REFRESH_EXPIRY') ?? '7d') as any,
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
