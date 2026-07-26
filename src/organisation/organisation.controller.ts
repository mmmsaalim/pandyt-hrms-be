import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { OrganisationService } from './organisation.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule('organisation')
@Controller('organisation')
export class OrganisationController {
  constructor(private readonly orgService: OrganisationService) {}

  // --- Org Tree ---
  @Get('tree')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD', 'EMPLOYEE')
  getTree(@Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } }) {
    return this.orgService.getTree(req.user);
  }

  // --- Locations ---
  @Get('locations')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD', 'EMPLOYEE')
  getLocations(@Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } }) {
    return this.orgService.findAllLocations(req.user);
  }

  @Post('locations')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @RequirePermissions('organisation.manage')
  createLocation(
    @Body() dto: { name: string; address?: string },
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.orgService.createLocation(dto, req.user);
  }

  @Patch('locations/:id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @RequirePermissions('organisation.manage')
  updateLocation(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { name?: string; address?: string },
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.orgService.updateLocation(id, dto, req.user);
  }

  @Delete('locations/:id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @RequirePermissions('organisation.manage')
  deleteLocation(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.orgService.deleteLocation(id, req.user);
  }

  // --- Departments ---
  @Get('departments')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD', 'EMPLOYEE')
  getDepartments(@Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } }) {
    return this.orgService.findAllDepartments(req.user);
  }

  @Post('departments')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @RequirePermissions('organisation.manage')
  createDepartment(
    @Body() dto: { name: string; locationId?: number; managerId?: number },
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.orgService.createDepartment(dto, req.user);
  }

  @Patch('departments/:id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @RequirePermissions('organisation.manage')
  updateDepartment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { name?: string; locationId?: number | null; managerId?: number },
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.orgService.updateDepartment(id, dto, req.user);
  }

  @Delete('departments/:id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @RequirePermissions('organisation.manage')
  deleteDepartment(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.orgService.deleteDepartment(id, req.user);
  }

  // --- Teams ---
  @Get('teams')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD', 'EMPLOYEE')
  getTeams(@Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } }) {
    return this.orgService.findAllTeams(req.user);
  }

  @Post('teams')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @RequirePermissions('organisation.manage')
  createTeam(
    @Body() dto: { name: string; departmentId: number },
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.orgService.createTeam(dto, req.user);
  }

  @Patch('teams/:id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @RequirePermissions('organisation.manage')
  updateTeam(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { name?: string; departmentId?: number },
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.orgService.updateTeam(id, dto, req.user);
  }

  @Delete('teams/:id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @RequirePermissions('organisation.manage')
  deleteTeam(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.orgService.deleteTeam(id, req.user);
  }
}
