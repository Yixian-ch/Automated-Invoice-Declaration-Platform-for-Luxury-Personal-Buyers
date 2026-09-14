import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class ConfirmSettlementDto {
  @IsUUID()
  invoiceId: string;

  @IsIn(['BANK_TRANSFER'])
  method: 'BANK_TRANSFER';

  @IsString()
  @MaxLength(100)
  bankAccountName: string;

  @IsString()
  @Matches(/^[A-Z]{2}[0-9]{2}[A-Z0-9 ]{10,40}$/i, { message: 'IBAN 格式不正确' })
  bankIban: string;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  bankBic?: string;

  /** Also store the bank details on the user profile for next time */
  @IsOptional()
  @IsBoolean()
  saveBankInfo?: boolean;
}
