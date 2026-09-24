import { IsString, Matches, MaxLength } from 'class-validator';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export class CreateReservationDto {
  @IsString()
  @MaxLength(64)
  merchantId!: string;

  /** 巴黎日期,YYYY-MM-DD */
  @Matches(YMD, { message: 'startDate 必须为 YYYY-MM-DD' })
  startDate!: string;

  /** 巴黎日期,YYYY-MM-DD,可与 startDate 相同 */
  @Matches(YMD, { message: 'endDate 必须为 YYYY-MM-DD' })
  endDate!: string;
}
