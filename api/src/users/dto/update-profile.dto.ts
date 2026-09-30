import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Gender } from '@prisma/client';
import { IsCountryName, IsInternationalPhone } from '../../common/validation/profile-rules';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsInternationalPhone()
  phone?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @IsCountryName()
  nationality?: string;

  @IsOptional()
  @IsCountryName()
  residenceCountry?: string;

  @IsOptional()
  @IsCountryName()
  taxResidenceCountry?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankAccountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(42)
  @Matches(/^[A-Z]{2}[0-9]{2}[A-Z0-9 ]{10,40}$/i, { message: 'IBAN 格式不正确' })
  bankIban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  bankBic?: string;
}
