import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { AssignUserRoleDto } from './dto/assign-user-role.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @Roles('SUPER_ADMIN')
  findAllRoles() {
    return this.rolesService.findAllRoles();
  }

  @Post()
  @Roles('SUPER_ADMIN')
  createRole(@Body() dto: CreateRoleDto) {
    return this.rolesService.createRole(dto);
  }

  @Post('assign')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN')
  assignRole(@Body() dto: AssignUserRoleDto) {
    return this.rolesService.assignRole(dto);
  }

  @Get('users/:userId')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN')
  listUserRoles(@Param('userId') userId: string) {
    return this.rolesService.listUserRoles(userId);
  }
}
