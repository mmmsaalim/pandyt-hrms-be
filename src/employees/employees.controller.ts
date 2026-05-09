import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Req } from '@nestjs/common';
import { InviteEmployeeDto } from './dto/invite-employee.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Roles('COMPANY_ADMIN')
  findAll(@Req() req: { user?: { sub: string; roles?: string[] } }) {
    return this.employeesService.findAll(req.user);
  }

  @Get(':id')
  @Roles('COMPANY_ADMIN', 'EMPLOYEE')
  findOne(
    @Param('id') id: string,
    @Req() req: { user?: { sub: string; roles?: string[] } },
  ) {
    return this.employeesService.findOne(id, req.user);
  }

  @Post()
  @Roles('COMPANY_ADMIN')
  create(
    @Body() dto: CreateEmployeeDto,
    @Req() req: { user?: { sub: string; roles?: string[] } },
  ) {
    return this.employeesService.create(dto, req.user);
  }

  @Post('invite')
  @Roles('COMPANY_ADMIN')
  inviteEmployee(
    @Body() dto: InviteEmployeeDto,
    @Req() req: { user?: { sub: string; roles?: string[] } },
  ) {
    return this.employeesService.inviteEmployee(dto, req.user);
  }

  @Patch(':id')
  @Roles('COMPANY_ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeDto,
    @Req() req: { user?: { sub: string; roles?: string[] } },
  ) {
    return this.employeesService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('COMPANY_ADMIN')
  remove(
    @Param('id') id: string,
    @Req() req: { user?: { sub: string; roles?: string[] } },
  ) {
    return this.employeesService.remove(id, req.user);
  }
}
