import { IsIn, IsString, MaxLength } from 'class-validator';
import { DISPUTE_CATEGORIES } from '../cashback-confirmation';

export class DisputeCashbackDto {
  @IsIn(DISPUTE_CATEGORIES as unknown as string[], { message: '请选择异议原因' })
  category!: string;

  @IsString()
  @MaxLength(1000)
  note!: string;
}

export class ResolveDisputeDto {
  @IsString()
  @MaxLength(1000)
  note!: string;
}
