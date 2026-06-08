import {
  Controller,
  Post,
  Put,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  NotFoundException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { UserRole } from '@prisma/client';

import { InvoiceService } from './invoice.service';
import { InitiateUploadDto } from './dto/initiate-upload.dto';

@Controller('invoices')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InvoiceController {
  constructor(private readonly invoiceService: InvoiceService) {}

  /**
   * POST /api/v1/invoices/upload-url
   * Returns a presigned S3 PUT URL + invoiceId.
   * Client uploads directly to S3, then calls /confirm.
   */
  @Post('upload-url')
  @Roles(UserRole.RESELLER, UserRole.ORG_ADMIN)
  async initiateUpload(
    @CurrentUser() user: { id: string },
    @Body() dto: InitiateUploadDto,
  ) {
    return this.invoiceService.initiateUpload(user.id, dto);
  }

  /**
   * PUT /api/v1/invoices/:id/dev-sink
   * Dev-only: accepts the file upload in place of S3 (used when BYPASS_S3=true).
   * No auth required — presigned URL is called directly by the browser.
   */
  @Put(':id/dev-sink')
  @Public()
  @HttpCode(HttpStatus.OK)
  async devSink(@Param('id') id: string, @Req() req: Request) {
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const dest = path.join(uploadsDir, id);
    await new Promise<void>((resolve, reject) => {
      const ws = fs.createWriteStream(dest);
      req.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    });
    return {};
  }

  /**
   * GET /api/v1/invoices/:id/image
   * Dev: serve locally saved file. In production this would return a presigned S3 URL.
   */
  @Get(':id/image')
  @Public()
  async serveImage(@Param('id') id: string, @Res() res: Response) {
    const filePath = path.resolve(process.cwd(), 'uploads', id);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Image not found');
    }
    const meta = await this.invoiceService.getFileMeta(id);
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (meta?.mimeType) {
      res.setHeader('Content-Type', meta.mimeType);
    }
    res.sendFile(filePath);
  }

  /**
   * POST /api/v1/invoices/:id/confirm
   * Called after the S3 upload completes; transitions to UPLOADED + queues OCR.
   */
  @Post(':id/confirm')
  @Roles(UserRole.RESELLER, UserRole.ORG_ADMIN)
  @HttpCode(HttpStatus.OK)
  async confirmUpload(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
  ) {
    return this.invoiceService.confirmUpload(user.id, id);
  }

  /**
   * GET /api/v1/invoices
   * List the current user's invoices (paginated).
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
   * Get a single invoice (owner sees own; admin sees all).
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

  /**
   * GET /api/v1/invoices/admin/all
   * Admin: list all invoices with optional status filter.
   */
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

  /**
   * POST /api/v1/invoices/:id/approve
   * Admin: approve invoice and compute cashback.
   */
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

  /**
   * POST /api/v1/invoices/:id/reject
   * Admin: reject invoice with reason.
   */
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
}
