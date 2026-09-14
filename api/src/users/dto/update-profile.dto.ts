import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

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
  @IsString()
  @MaxLength(30)
  phone?: string;

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
  @MaxLength(42)
  @Matches(/^[A-Z]{2}[0-9]{2}[A-Z0-9 ]{10,40}$/i, { message: 'IBAN 格式不正确' })
  bankIban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  bankBic?: string;
}
