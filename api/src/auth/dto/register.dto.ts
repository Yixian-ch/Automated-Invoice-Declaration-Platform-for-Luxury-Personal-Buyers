import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsIn,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsIn(['fr', 'en', 'zh'])
  locale?: string;

  /**
   * Path A — self-registration (new reseller or org).
   * One of inviteCode OR accountType must be provided.
   */
  @IsOptional()
  @IsIn(['INDIVIDUAL', 'ORGANIZATION'])
  accountType?: 'INDIVIDUAL' | 'ORGANIZATION';

  /** Required only when accountType === 'ORGANIZATION' */
  @ValidateIf((o) => o.accountType === 'ORGANIZATION')
  @IsString()
  companyName?: string;

  @IsOptional()
  @IsString()
  companyRegistrationNo?: string;

  /**
   * Path B — invite-based registration (employee / org member).
   */
  @IsOptional()
  @IsString()
  inviteCode?: string;
}
