import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { CreatePayrollRunDto } from './dto/create-payroll-run.dto';
import { UpdatePayrollRunDto } from './dto/update-payroll-run.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Get()
  @Roles('COMPANY_ADMIN')
  findAll(@Req() req: { user?: { sub: string; roles?: string[]; tenantId?: string } }) {
    return this.payrollService.findAll(req.user);
  }

  @Post()
  @Roles('COMPANY_ADMIN')
  create(
    @Body() dto: CreatePayrollRunDto,
    @Req() req: { user?: { sub: string; roles?: string[]; tenantId?: string } },
  ) {
    return this.payrollService.create(dto, req.user);
  }

  @Patch(':id')
  @Roles('COMPANY_ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePayrollRunDto,
    @Req() req: { user?: { sub: string; roles?: string[]; tenantId?: string } },
  ) {
    return this.payrollService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('COMPANY_ADMIN')
  remove(
    @Param('id') id: string,
    @Req() req: { user?: { sub: string; roles?: string[]; tenantId?: string } },
  ) {
    return this.payrollService.remove(id, req.user);
  }
}
