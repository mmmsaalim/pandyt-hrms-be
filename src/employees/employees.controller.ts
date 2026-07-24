import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { Req } from '@nestjs/common';
import { InviteEmployeeDto } from './dto/invite-employee.dto';
import { OffboardEmployeeDto } from './dto/offboard-employee.dto';
import { EnableEmployeeLoginDto } from './dto/enable-employee-login.dto';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule('employees')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD')
  findAll(@Req() req: { user?: { sub: number; roles?: string[] } }) {
    return this.employeesService.findAll(req.user);
  }

  @Get('me')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD', 'EMPLOYEE')
  findMe(@Req() req: { user?: { sub: number; roles?: string[] } }) {
    return this.employeesService.findMe(req.user);
  }

  @Patch('me')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD', 'EMPLOYEE')
  updateMe(
    @Body() dto: UpdateEmployeeDto,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.employeesService.updateMe(dto, req.user);
  }

  @Get(':id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'EMPLOYEE')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.employeesService.findOne(id, req.user);
  }

  @Post()
  @Roles('COMPANY_ADMIN')
  create(
    @Body() dto: CreateEmployeeDto,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.employeesService.create(dto, req.user);
  }

  @Post('invite')
  @RequirePermissions('employees.invite')
  inviteEmployee(
    @Body() dto: InviteEmployeeDto,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.employeesService.inviteEmployee(dto, req.user);
  }

  @Patch(':id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEmployeeDto,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.employeesService.update(id, dto, req.user);
  }

  @Post(':id/enable-login')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  enableLogin(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EnableEmployeeLoginDto,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.employeesService.enableEmployeeLogin(id, dto.workEmail, req.user);
  }

  @Post(':id/offboard')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN')
  offboard(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OffboardEmployeeDto,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.employeesService.offboard(id, req.user, dto);
  }

  @Delete(':id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'SUPER_ADMIN')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.employeesService.remove(id, req.user);
  }

  @Delete(':id/anonymize')
  @Roles('COMPANY_ADMIN')
  anonymize(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.employeesService.anonymize(id, req.user);
  }

  @Get(':id/export-data')
  @Roles('COMPANY_ADMIN', 'EMPLOYEE')
  exportData(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.employeesService.exportData(id, req.user);
  }
}
