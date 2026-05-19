import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { User, Prisma } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findByEmailVerificationToken(token: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { emailVerificationToken: token } });
  }

  async create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data });
  }

  /** Return user without sensitive fields */
  sanitize(user: User): Omit<User, 'passwordHash' | 'refreshTokenHash' | 'emailVerificationToken' | 'passwordResetToken' | 'mfaSecret'> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, refreshTokenHash, emailVerificationToken, passwordResetToken, mfaSecret, ...safe } = user;
    return safe;
  }

  async getProfile(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { organization: { select: { id: true, name: true, kybStatus: true } } },
    });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }
}
