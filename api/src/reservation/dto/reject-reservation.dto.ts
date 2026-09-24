import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectReservationDto {
  @IsString()
  @MinLength(1, { message: '拒绝时必须填写原因' })
  @MaxLength(500)
  note!: string;
}
