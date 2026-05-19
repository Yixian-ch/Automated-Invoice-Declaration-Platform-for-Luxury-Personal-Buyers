import { Controller, Post, Get, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { InviteService } from './invite.service';
import { CreateInviteDto } from './dto/create-invite.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('invites')
export class InviteController {
  constructor(private readonly inviteService: InviteService) {}

  @Roles(UserRole.ADMIN, UserRole.ORG_ADMIN)
  @Post()
  create(
    @CurrentUser() user: { sub: string; role: UserRole },
    @Body() dto: CreateInviteDto,
  ) {
    return this.inviteService.create(user.sub, user.role, dto);
  }

  @Roles(UserRole.ADMIN)
  @Get()
  listAll() {
    return this.inviteService.listAll();
  }

  @Roles(UserRole.ADMIN, UserRole.ORG_ADMIN)
  @Delete(':id')
  revoke(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string },
  ) {
    return this.inviteService.revoke(id, user.sub);
  }
}
