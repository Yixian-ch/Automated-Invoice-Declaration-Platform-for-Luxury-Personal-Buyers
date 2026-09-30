import { applyDecorators } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Matches, MaxLength } from 'class-validator';

/** Per-file limit for profile documents (nginx allows 12m per request) */
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10 MB

/** ≥8 chars with at least one digit, lowercase, uppercase and special character */
export const PASSWORD_PATTERN = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;
export const PASSWORD_RULE_MESSAGE = '密码至少 8 位,且须包含数字、大写字母、小写字母和特殊字符';

/** Strip separators and turn a 00 international prefix into + (0086… → +86…) */
export function normalizePhone(value: string): string {
  const compact = value.replace(/[\s\-().]/g, '');
  return compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
}

/** Mobile number with country code, stored normalized as +<digits> */
export function IsInternationalPhone() {
  return applyDecorators(
    Transform(({ value }) => (typeof value === 'string' ? normalizePhone(value) : value)),
    IsString(),
    Matches(/^\+[1-9]\d{6,14}$/, { message: '请填写带国家号的手机号码,如 +8613366666666' }),
  );
}

/** Free-text country name (nationality, residence, tax residence) */
export function IsCountryName() {
  return applyDecorators(
    Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)),
    IsString(),
    Matches(/\S/, { message: '国家不能为空' }),
    MaxLength(100),
  );
}
