import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReservationStatus, UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReservationService } from './reservation.service';
import { MerchantService } from './merchant.service';
import { RejectReservationDto } from './dto/reject-reservation.dto';
import { CreateMerchantDto, UpdateMerchantDto } from './dto/merchant.dto';

/** 后台:预约审核 + 商家管理 */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ReservationAdminController {
  constructor(
    private readonly reservations: ReservationService,
    private readonly merchants: MerchantService,
  ) {}

  // ─── 预约 ────────────────────────────────────────────────────────────────

  /** GET /api/v1/admin/reservations?status=&page=&limit= */
  @Get('reservations')
  list(
    @Query('status') status?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page = 1,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit = 100,
  ) {
    let parsed: ReservationStatus | undefined;
    if (status) {
      if (!(status in ReservationStatus)) throw new BadRequestException('status 无效');
      parsed = status as ReservationStatus;
    }
    return this.reservations.adminList(parsed, page, Math.min(limit, 200));
  }

  /** POST /api/v1/admin/reservations/:id/accept */
  @Post('reservations/:id/accept')
  @HttpCode(HttpStatus.OK)
  accept(@CurrentUser() admin: { id: string }, @Param('id') id: string) {
    return this.reservations.accept(admin.id, id);
  }

  /** POST /api/v1/admin/reservations/:id/reject { note } */
  @Post('reservations/:id/reject')
  @HttpCode(HttpStatus.OK)
  reject(
    @CurrentUser() admin: { id: string },
    @Param('id') id: string,
    @Body() dto: RejectReservationDto,
  ) {
    return this.reservations.reject(admin.id, id, dto.note);
  }

  // ─── 商家 ────────────────────────────────────────────────────────────────

  /** GET /api/v1/admin/merchants */
  @Get('merchants')
  listMerchants() {
    return this.merchants.listAll();
  }

  /** POST /api/v1/admin/merchants { name, taxId } */
  @Post('merchants')
  createMerchant(@Body() dto: CreateMerchantDto) {
    return this.merchants.create(dto);
  }

  /** PATCH /api/v1/admin/merchants/:id { name?, taxId?, active? } */
  @Patch('merchants/:id')
  updateMerchant(@Param('id') id: string, @Body() dto: UpdateMerchantDto) {
    return this.merchants.update(id, dto);
  }
}
