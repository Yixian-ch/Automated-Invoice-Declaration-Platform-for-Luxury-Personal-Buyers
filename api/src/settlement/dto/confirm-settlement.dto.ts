import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export const SETTLEMENT_METHODS = ['BANK_TRANSFER', 'VOUCHER', 'GIFT_CARD'] as const;
export type SettlementMethodValue = (typeof SETTLEMENT_METHODS)[number];

export class ConfirmSettlementDto {
  @IsUUID()
  invoiceId: string;

  @IsIn(SETTLEMENT_METHODS)
  method: SettlementMethodValue;

  /** Bank details are required only for bank transfers */
  @ValidateIf((o: ConfirmSettlementDto) => o.method === 'BANK_TRANSFER')
  @IsString()
  @MaxLength(100)
  bankAccountName?: string;

  @ValidateIf((o: ConfirmSettlementDto) => o.method === 'BANK_TRANSFER')
  @IsString()
  @Matches(/^[A-Z]{2}[0-9]{2}[A-Z0-9 ]{10,40}$/i, { message: 'IBAN 格式不正确' })
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
