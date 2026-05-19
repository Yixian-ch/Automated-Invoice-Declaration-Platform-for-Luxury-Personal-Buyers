import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export enum InitiateUploadType {
  PDF = 'application/pdf',
  JPEG = 'image/jpeg',
  PNG = 'image/png',
}

export class InitiateUploadDto {
  @IsEnum(InitiateUploadType, {
    message: 'mimeType must be application/pdf, image/jpeg, or image/png',
  })
  mimeType: InitiateUploadType;

  @IsString()
  @MaxLength(255)
  originalFilename: string;

  @IsOptional()
  @IsString()
  @MaxLength(10) // max 10 digits (covers up to 9,999,999,999 bytes)
  fileSizeBytes?: string; // sent as string from multipart; validated as int in service
}
