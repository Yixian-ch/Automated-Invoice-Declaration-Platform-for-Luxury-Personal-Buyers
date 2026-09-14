import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SettlementStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SettlementService } from './settlement.service';
import { ConfirmSettlementDto } from './dto/confirm-settlement.dto';
import { PartnerCallbackDto } from './dto/partner-callback.dto';

@Controller('settlements')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SettlementController {
  constructor(private readonly settlementService: SettlementService) {}

  /** Approved invoices awaiting the customer's cashback confirmation */
  @Get('pending')
  @Roles(UserRole.RESELLER, UserRole.ORG_ADMIN)
  listPending(@CurrentUser() user: { id: string }) {
    return this.settlementService.listPendingConfirmation(user.id);
  }

  /** The customer's settlement history */
  @Get('mine')
  @Roles(UserRole.RESELLER, UserRole.ORG_ADMIN)
  listMine(@CurrentUser() user: { id: string }) {
    return this.settlementService.listMine(user.id);
  }

  /** Confirm a cashback and trigger the automatic payout */
  @Post()
  @Roles(UserRole.RESELLER, UserRole.ORG_ADMIN)
  confirm(@CurrentUser() user: { id: string }, @Body() dto: ConfirmSettlementDto) {
    return this.settlementService.confirm(user.id, dto);
  }

  /** Retry a failed payout */
  @Post(':id/retry')
  @Roles(UserRole.RESELLER, UserRole.ORG_ADMIN)
  retry(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.settlementService.retry(user.id, id);
  }

  /** Admin: all settlements (e.g. ?status=CONFIRMED for vouchers to issue) */
  @Get('admin/all')
  @Roles(UserRole.ADMIN, UserRole.REVIEWER)
  listAll(@Query('status') status?: string) {
    const valid = ['CONFIRMED', 'SENT', 'PAID', 'FAILED'];
    return this.settlementService.listAll(
      status && valid.includes(status) ? (status as SettlementStatus) : undefined,
    );
  }

  /** Admin: mark a manually issued voucher / gift card as delivered */
  @Post(':id/fulfill')
  @Roles(UserRole.ADMIN)
  fulfill(@Param('id') id: string) {
    return this.settlementService.fulfill(id);
  }

  /** Partner payment company notifies the payout outcome */
  @Post('callback')
  @Public()
  @UseGuards(ThrottlerGuard)
  callback(
    @Headers('x-payout-secret') secret: string | undefined,
    @Body() body: PartnerCallbackDto,
  ) {
    return this.settlementService.handlePartnerCallback(secret, body);
  }
}
