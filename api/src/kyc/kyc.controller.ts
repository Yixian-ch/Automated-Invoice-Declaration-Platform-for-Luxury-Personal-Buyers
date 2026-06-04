import { Controller, Post, Body, UseGuards, Param } from '@nestjs/common';
import { KycService } from './kyc.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IsString, IsIn } from 'class-validator';
import { UserRole } from '@prisma/client';

class StartKycDto {
  @IsString()
  @IsIn(['kyc', 'kyb'])
  type: 'kyc' | 'kyb';
  @IsString()
  originalFilename: string;
  @IsString()
  mimeType: string;
}

class ConfirmDto {
  @IsString()
  s3Key: string;
}

@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  /** Authenticated reseller requests a presigned URL for passport upload */
  @UseGuards(JwtAuthGuard)
  @Post('session')
  startSession(
    @CurrentUser() user: { sub: string },
    @Body() dto: StartKycDto,
  ) {
    return this.kycService.createUploadUrl(user.sub, dto.originalFilename, dto.mimeType);
  }

  /** Client confirms upload; mark user as pending review */
  @UseGuards(JwtAuthGuard)
  @Post('confirm')
  confirmUpload(
    @CurrentUser() user: { sub: string },
    @Body() dto: ConfirmDto,
  ) {
    return this.kycService.confirmUpload(user.sub, dto.s3Key);
  }

  /** Admin: approve user's KYC */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.REVIEWER)
  @Post(':userId/approve')
  approve(@CurrentUser() admin: { sub: string }, @Param('userId') userId: string, @Body() body: { note?: string }) {
    return this.kycService.approve(admin.sub, userId, body?.note);
  }

  /** Admin: reject user's KYC */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN, UserRole.REVIEWER)
  @Post(':userId/reject')
  reject(@CurrentUser() admin: { sub: string }, @Param('userId') userId: string, @Body() body: { note?: string }) {
    return this.kycService.reject(admin.sub, userId, body?.note);
  }
}

