import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UsersService, ProfileDocumentType } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10 MB
const DOCUMENT_TYPES: ProfileDocumentType[] = ['passport', 'business-license'];

function parseDocumentType(type: string): ProfileDocumentType {
  if (!DOCUMENT_TYPES.includes(type as ProfileDocumentType)) {
    throw new BadRequestException('未知的文档类型');
  }
  return type as ProfileDocumentType;
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getProfile(@CurrentUser() user: { id: string }) {
    return this.usersService.getProfile(user.id);
  }

  @Patch('me')
  updateProfile(@CurrentUser() user: { id: string }, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Post('me/documents/:type')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_SIZE } }))
  uploadDocument(
    @CurrentUser() user: { id: string },
    @Param('type') type: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('未收到文件');
    return this.usersService.saveDocument(
      user.id,
      parseDocumentType(type),
      file.buffer,
      file.mimetype,
    );
  }

  @Get('me/documents/:type')
  async serveDocument(
    @CurrentUser() user: { id: string },
    @Param('type') type: string,
    @Res() res: Response,
  ) {
    const doc = await this.usersService.getDocument(user.id, parseDocumentType(type));
    res.setHeader('Content-Type', doc.mimeType);
    res.sendFile(doc.path);
  }
}
