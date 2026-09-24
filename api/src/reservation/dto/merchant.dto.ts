import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMerchantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  /** SIRET,14 位数字(允许输入时带空格) */
  @IsString()
  @MaxLength(32)
  taxId!: string;
}

export class UpdateMerchantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  taxId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
