import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
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
  findAll(@Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } }) {
    return this.payrollService.findAll(req.user);
  }

  @Post()
  @Roles('COMPANY_ADMIN')
  create(
    @Body() dto: CreatePayrollRunDto,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.payrollService.create(dto, req.user);
  }

  /**
   * POST /payroll/:id/process
   * Triggers the Sri Lanka statutory payroll calculation engine.
   * Computes EPF (8%/12%), ETF (3%), and PAYE for all active employees
   * and generates payslips in one atomic run.
   */
  @Post(':id/process')
  @Roles('COMPANY_ADMIN')
  process(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.payrollService.process(id, req.user);
  }

  @Patch(':id')
  @Roles('COMPANY_ADMIN')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePayrollRunDto,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.payrollService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('COMPANY_ADMIN')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.payrollService.remove(id, req.user);
  }
}
