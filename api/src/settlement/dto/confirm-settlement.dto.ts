import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

const trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export const SETTLEMENT_METHODS = ['BANK_TRANSFER', 'VOUCHER', 'GIFT_CARD'] as const;
export type SettlementMethodValue = (typeof SETTLEMENT_METHODS)[number];

export class ConfirmSettlementDto {
  @IsUUID()
  invoiceId: string;

  @IsIn(SETTLEMENT_METHODS)
  method: SettlementMethodValue;

  /** Bank details are required only for bank transfers */
  @ValidateIf((o: ConfirmSettlementDto) => o.method === 'BANK_TRANSFER')
  @trim()
  @IsString()
  @IsNotEmpty({ message: '请填写收款人姓名' })
  @MaxLength(100)
  bankAccountName?: string;

  /** 银行名称(与我的主页「银行名称」一致) */
  @ValidateIf((o: ConfirmSettlementDto) => o.method === 'BANK_TRANSFER')
  @trim()
  @IsString()
  @IsNotEmpty({ message: '请填写银行名称' })
  @MaxLength(100)
  bankName?: string;

  /** 收款银行账户(IBAN) */
  @ValidateIf((o: ConfirmSettlementDto) => o.method === 'BANK_TRANSFER')
  @IsString()
  @Matches(/^[A-Z]{2}[0-9]{2}[A-Z0-9 ]{10,40}$/i, { message: '收款银行账户格式不正确(应为 IBAN,如 FR76…)' })
  bankIban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  bankBic?: string;

  /** Also store the bank details on the user profile for next time */
  @IsOptional()
  @IsBoolean()
  saveBankInfo?: boolean;
}
