import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { AssignUserRoleDto } from './dto/assign-user-role.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { CreateTenantRoleDto } from './dto/create-tenant-role.dto';
import { SetRolePermissionsDto } from './dto/set-role-permissions.dto';
import { AssignScopedUserRoleDto } from './dto/assign-scoped-user-role.dto';
import { UnassignScopedUserRoleDto } from './dto/unassign-scoped-user-role.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get('configuration')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN')
  configuration(@Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } }) {
    return this.rolesService.getConfiguration(req.user);
  }

  @Post('permissions')
  @Roles('SUPER_ADMIN')
  createPermission(
    @Body() dto: CreatePermissionDto,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.rolesService.createPermission(dto, req.user);
  }

  @Post('tenant')
  @Roles('COMPANY_ADMIN')
  createTenantRole(
    @Body() dto: CreateTenantRoleDto,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.rolesService.createTenantRole(dto, req.user);
  }

  @Post('tenant/bootstrap-modules')
  @Roles('COMPANY_ADMIN')
  bootstrapTenantModuleRoles(
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.rolesService.bootstrapTenantModuleRoles(req.user);
  }

  @Get(':roleId/permissions')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN')
  listRolePermissions(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.rolesService.listRolePermissions(roleId, req.user);
  }

  @Put(':roleId/permissions')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN')
  setRolePermissions(
    @Param('roleId', ParseIntPipe) roleId: number,
    @Body() dto: SetRolePermissionsDto,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.rolesService.setRolePermissions(roleId, dto, req.user);
  }

  @Post('assign/scoped')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN')
  assignScopedRole(
    @Body() dto: AssignScopedUserRoleDto,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.rolesService.assignScopedRole(dto, req.user);
  }

  @Post('unassign/scoped')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN')
  unassignScopedRole(
    @Body() dto: UnassignScopedUserRoleDto,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.rolesService.unassignScopedRole(dto, req.user);
  }

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
  listUserRoles(@Param('userId', ParseIntPipe) userId: number) {
    return this.rolesService.listUserRoles(userId);
  }
}
