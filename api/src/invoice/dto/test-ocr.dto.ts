import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export const OCR_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export class TestOcrDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsIn(OCR_MIME_TYPES as unknown as string[])
  mime_type!: string;
}
