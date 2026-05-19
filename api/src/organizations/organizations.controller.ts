import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  @Roles(UserRole.ADMIN)
  @Get()
  listAll() {
    return this.orgsService.listAll();
  }

  @Roles(UserRole.ADMIN, UserRole.ORG_ADMIN)
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { sub: string; role: UserRole },
  ) {
    return this.orgsService.findById(id);
  }
}
