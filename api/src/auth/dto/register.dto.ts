import { Transform } from 'class-transformer';
import { IsEmail, IsString, IsOptional, IsIn, IsEnum, Matches, MaxLength } from 'class-validator';
import { Gender } from '@prisma/client';
import {
  IsCountryName,
  IsInternationalPhone,
  PASSWORD_PATTERN,
  PASSWORD_RULE_MESSAGE,
} from '../../common/validation/profile-rules';

const trim = Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Registration questionnaire — sent as multipart, with the passport first page as `passport` */
export class RegisterDto {
  @trim
  @IsString()
  @Matches(/\S/, { message: '请填写姓' })
  @MaxLength(100)
  lastName: string;

  @trim
  @IsString()
  @Matches(/\S/, { message: '请填写名' })
  @MaxLength(100)
  firstName: string;

  @IsEnum(Gender, { message: '请选择性别' })
  gender: Gender;

  @trim
  @IsEmail()
  email: string;

  @IsInternationalPhone()
  phone: string;

  @IsCountryName()
  nationality: string;

  @IsCountryName()
  residenceCountry: string;

  @IsCountryName()
  taxResidenceCountry: string;

  @IsString()
  @Matches(PASSWORD_PATTERN, { message: PASSWORD_RULE_MESSAGE })
  password: string;

  @IsOptional()
  @IsIn(['fr', 'en', 'zh'])
  locale?: string;
}
