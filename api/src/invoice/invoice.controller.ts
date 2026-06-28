import {
  Controller,
  Post,
  Patch,
  Delete,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
  Res,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import * as fs from 'fs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { UserRole } from '@prisma/client';

import { InvoiceService } from './invoice.service';
import { OcrService } from '../ocr/ocr.service';

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoiceController {
  constructor(
    private readonly invoiceService: InvoiceService,
    private readonly ocrService: OcrService,
  ) {}

  @Post('test-ocr')
  @Public()
  async testOcr(@Body() body: { content: string; mime_type: string }) {
    const buf = Buffer.from(body.content, 'base64');
    return this.ocrService.processDocument(buf, body.mime_type);
  }

  /**
   * POST /api/v1/invoices/upload
   * Direct multipart upload — saves locally and queues OCR in one step.
   */
  @Post('upload')
  @Roles(UserRole.RESELLER, UserRole.ORG_ADMIN)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async upload(
    @CurrentUser() user: { id: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file provided');
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException('Only PDF, JPEG, and PNG files are supported');
    }
    return this.invoiceService.uploadAndEnqueue(
      user.id,
      file.buffer,
      file.mimetype,
      file.originalname,
      file.size,
    );
  }

  /**
   * GET /api/v1/invoices/:id/image
   * Serve the locally stored invoice file.
   */
  @Get(':id/image')
  @Public()
  async serveImage(@Param('id') id: string, @Res() res: Response) {
    const meta = await this.invoiceService.getFileMeta(id);
    if (!meta) throw new NotFoundException('Invoice not found');

    const filePath = this.invoiceService['storage'].getFilePath(id);
    if (!fs.existsSync(filePath)) throw new NotFoundException('Image not found');

    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (meta.mimeType) res.setHeader('Content-Type', meta.mimeType);
    res.sendFile(filePath);
  }

  /**
   * GET /api/v1/invoices
   */
  @Get()
  @Roles(UserRole.RESELLER, UserRole.ORG_ADMIN, UserRole.ADMIN, UserRole.REVIEWER)
  async list(
    @CurrentUser() user: { id: string },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.invoiceService.listByUser(user.id, page, Math.min(limit, 100));
  }

  /**
   * GET /api/v1/invoices/:id
   */
  @Get(':id')
  @Roles(UserRole.RESELLER, UserRole.ORG_ADMIN, UserRole.ADMIN, UserRole.REVIEWER)
  async getOne(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id') id: string,
  ) {
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.REVIEWER;
    return this.invoiceService.getById(user.id, id, isAdmin);
  }

  // ─── Admin endpoints ───────────────────────

  @Get('admin/all')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER)
  async adminList(
    @Query('status') status?: string,
    @Query('userId') userId?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number = 50,
  ) {
    return this.invoiceService.adminList(status, page, Math.min(limit, 200), userId);
  }

  @Post(':id/approve')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async approve(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body('note') note?: string,
  ) {
    return this.invoiceService.approve(user.id, id, note);
  }

  @Post(':id/reject')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body('note') note: string,
  ) {
    return this.invoiceService.reject(user.id, id, note);
  }

  @Patch(':id/correct')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  async correct(
    @Param('id') id: string,
    @Body() dto: { vendorName?: string; purchaseDate?: string; grandTotalAmount?: string },
  ) {
    return this.invoiceService.correctInvoice(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteInvoice(@Param('id') id: string) {
    return this.invoiceService.deleteInvoice(id);
  }
}
