import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReservationService } from './reservation.service';
import { MerchantService } from './merchant.service';
import { CreateReservationDto } from './dto/create-reservation.dto';

const BUYER_ROLES = [UserRole.RESELLER, UserRole.ORG_ADMIN];

/** 买手端:我的预约 */
@Controller('reservations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReservationController {
  constructor(
    private readonly reservations: ReservationService,
    private readonly merchants: MerchantService,
  ) {}

  /** GET /api/v1/reservations/merchants — 可预约的商家(启用中) */
  @Get('merchants')
  @Roles(...BUYER_ROLES)
  listMerchants() {
    return this.merchants.listActive();
  }

  /** GET /api/v1/reservations — 我的预约列表 */
  @Get()
  @Roles(...BUYER_ROLES)
  listMine(@CurrentUser() user: { id: string }) {
    return this.reservations.listMine(user.id);
  }

  /** POST /api/v1/reservations — 新建预约 */
  @Post()
  @Roles(...BUYER_ROLES)
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateReservationDto) {
    return this.reservations.create(user.id, dto);
  }

  /** POST /api/v1/reservations/:id/cancel — 客户取消 */
  @Post(':id/cancel')
  @Roles(...BUYER_ROLES)
  @HttpCode(HttpStatus.OK)
  cancel(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.reservations.cancel(user.id, id);
  }
}
