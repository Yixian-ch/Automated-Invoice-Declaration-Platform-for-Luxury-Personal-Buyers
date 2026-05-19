import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
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
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number = 50,
  ) {
    return this.invoiceService.adminList(status, page, Math.min(limit, 200));
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
