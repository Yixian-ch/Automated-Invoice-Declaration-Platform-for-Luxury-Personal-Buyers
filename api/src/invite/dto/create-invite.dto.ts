import { IsOptional, IsString, IsEnum, IsInt, Min, Max } from 'class-validator';
import { UserRole } from '@prisma/client';

export class CreateInviteDto {
  @IsEnum(UserRole)
  intendedRole: UserRole;

  @IsOptional()
  @IsString()
  intendedOrgId?: string;

  /** Expiry in hours, default 72 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  expiryHours?: number;
}
