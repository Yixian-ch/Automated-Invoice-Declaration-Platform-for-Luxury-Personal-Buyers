import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Partner payout callback. Exactly one of settlementId / partnerRef must
 * identify the settlement (enforced in the service). Unknown statuses are
 * rejected with 400 rather than guessed at.
 */
export class PartnerCallbackDto {
  @IsOptional()
  @IsUUID()
  settlementId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  partnerRef?: string;

  @IsIn(['paid', 'failed'])
  status: 'paid' | 'failed';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
