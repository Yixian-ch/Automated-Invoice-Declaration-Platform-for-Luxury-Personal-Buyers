import {
  Controller,
  Get,
  Post,
  Body,
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
}
