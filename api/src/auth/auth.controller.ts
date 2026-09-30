import {
  Controller,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MAX_DOCUMENT_SIZE } from '../common/validation/profile-rules';

const REFRESH_COOKIE = 'refresh_token';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/api/v1/auth/refresh',
};

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Multipart: questionnaire fields + `passport` (first page, required) */
  @Post('register')
  @UseInterceptors(FileInterceptor('passport', { limits: { fileSize: MAX_DOCUMENT_SIZE } }))
  register(@Body() dto: RegisterDto, @UploadedFile() passport: Express.Multer.File) {
    if (!passport) throw new BadRequestException('请上传有效护照首页');
    return this.authService.register(dto, passport);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] ?? req.ip;
    const result = await this.authService.login(dto, ip);

    // Deliver refresh token as httpOnly cookie
    res.cookie(REFRESH_COOKIE, result.refreshToken, COOKIE_OPTIONS);

    return { accessToken: result.accessToken, user: result.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token: string | undefined = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
      res.status(HttpStatus.UNAUTHORIZED).json({ message: 'No refresh token' });
      return;
    }

    // Decode without verification to get userId — verification happens in service
    const decoded = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64').toString(),
    ) as { sub: string };

    const tokens = await this.authService.refresh(decoded.sub, token);
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, COOKIE_OPTIONS);
    return { accessToken: tokens.accessToken };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: { sub: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth/refresh' });
    return this.authService.logout(user.sub);
  }
}
