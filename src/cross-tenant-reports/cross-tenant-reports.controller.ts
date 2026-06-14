import { Controller, Get, UseGuards, Query, ParseArrayPipe, Header } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CrossTenantReportsService } from './cross-tenant-reports.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('cross-tenant-reports')
export class CrossTenantReportsController {
  constructor(private readonly crossTenantReportsService: CrossTenantReportsService) {}

  // UI Table Data
  @Get('leave-summary')
  async getLeaveSummaryReport(@Query('tenantIds', new ParseArrayPipe({ optional: true })) tenantIds?: number[]) {
    return this.crossTenantReportsService.getLeaveSummary(tenantIds);
  }

  @Get('attendance-summary')
  async getAttendanceSummaryReport(@Query('tenantIds', new ParseArrayPipe({ optional: true })) tenantIds?: number[]) {
    return this.crossTenantReportsService.getAttendanceSummary(tenantIds);
  }

  @Get('payroll-summary')
  async getPayrollSummaryReport(@Query('tenantIds', new ParseArrayPipe({ optional: true })) tenantIds?: number[]) {
    return this.crossTenantReportsService.getPayrollSummary(tenantIds);
  }

  // Excel Exports Only
  @Get('leave-summary/export-excel')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="leave-summary.xlsx"')
  async exportLeaveSummaryExcel(@Query('tenantIds', new ParseArrayPipe({ optional: true })) tenantIds?: number[]) {
    return this.crossTenantReportsService.generateLeaveSummaryExcel(tenantIds);
  }

  @Get('attendance-summary/export-excel')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="attendance-summary.xlsx"')
  async exportAttendanceSummaryExcel(@Query('tenantIds', new ParseArrayPipe({ optional: true })) tenantIds?: number[]) {
    return this.crossTenantReportsService.generateAttendanceSummaryExcel(tenantIds);
  }

  @Get('payroll-summary/export-excel')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="payroll-summary.xlsx"')
  async exportPayrollSummaryExcel(@Query('tenantIds', new ParseArrayPipe({ optional: true })) tenantIds?: number[]) {
    return this.crossTenantReportsService.generatePayrollSummaryExcel(tenantIds);
  }
}