import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '@prisma/client';
import { AdminService } from './admin.service.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * GET /api/v1/admin/reconciliation
   * Returns grouped merchant + date rows compared against merchant_bills.
   */
  @Get('reconciliation')
  getReconciliation() {
    return this.adminService.getReconciliation();
  }

  /**
   * GET /api/v1/admin/reconciliation/drill-down?merchantName=&date=
   * Returns all approved invoices for a specific merchant + date.
   */
  @Get('reconciliation/drill-down')
  getDrillDown(
    @Query('merchantName') merchantName: string,
    @Query('date') date: string,
  ) {
    return this.adminService.getDrillDown(merchantName, date);
  }

  /**
   * POST /api/v1/admin/merchant-bills
   * Upsert merchant bill entries for reconciliation.
   * Body: [{ merchantName, date (YYYY-MM-DD), totalAmount }]
   */
  @Post('merchant-bills')
  @HttpCode(HttpStatus.OK)
  importMerchantBills(
    @Body() bills: { merchantName: string; date: string; totalAmount: number }[],
  ) {
    return this.adminService.importMerchantBills(bills);
  }

  /**
   * GET /api/v1/admin/merchant-bills
   * List all imported merchant bills.
   */
  @Get('merchant-bills')
  listMerchantBills() {
    return this.adminService.listMerchantBills();
  }

  /**
   * GET /api/v1/admin/users
   * List all buyer users for cashback rate management.
   */
  @Get('users')
  listUsers() {
    return this.adminService.listBuyerUsers();
  }

  /**
   * PATCH /api/v1/admin/invoices/:id/correct
   * Manually correct OCR-extracted fields and clear the needsReview flag.
   */
  @Patch('invoices/:id/correct')
  @HttpCode(HttpStatus.OK)
  correctInvoice(
    @Param('id') invoiceId: string,
    @Body() dto: { vendorName?: string; purchaseDate?: string; grandTotalAmount?: string },
  ) {
    return this.adminService.correctInvoice(invoiceId, dto);
  }

  /**
   * PATCH /api/v1/admin/users/:id/cashback-rate
   * Update a buyer's cashback rate.
   */
  @Patch('users/:id/cashback-rate')
  updateCashbackRate(
    @Param('id') userId: string,
    @Body() body: { cashbackRate: number },
  ) {
    return this.adminService.updateUserCashbackRate(userId, body.cashbackRate);
  }
}
