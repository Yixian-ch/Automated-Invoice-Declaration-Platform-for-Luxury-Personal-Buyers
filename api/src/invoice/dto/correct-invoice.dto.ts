import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CorrectLineItemDto {
  @IsString()
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  itemCategory?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsNumber()
  @Min(0)
  amount_ttc!: number;
}

/** 后台更正识别数据(返点由规则重新计算,不允许直接改返点金额) */
export class CorrectInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  vendorName?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  purchaseDate?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, { message: 'grandTotalAmount 必须是金额' })
  grandTotalAmount?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CorrectLineItemDto)
  lineItems?: CorrectLineItemDto[];
}
