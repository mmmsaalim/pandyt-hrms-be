import {
  Controller,
  Get,
  Header,
  ParseArrayPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';

type AuthedRequest = { user?: { sub: number; roles?: string[]; tenantId?: number } };

@UseGuards(JwtAuthGuard, RolesGuard, ModuleEnabledGuard)
@RequireModule('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  summary(@Req() req: AuthedRequest) {
    return this.reportsService.summary(req.user);
  }

  // ---------------------------------------------------------------------
  // Platform report (SUPER_ADMIN) — tenant/plan/user-count only, no
  // per-tenant user detail (privacy: other tenants' users are not
  // superadmin's data to browse).
  // ---------------------------------------------------------------------

  @Get('platform/tenants')
  @Roles('SUPER_ADMIN')
  platformTenants() {
    return this.reportsService.platformTenantReport();
  }

  @Get('platform/tenants/export-excel')
  @Roles('SUPER_ADMIN')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="tenant-report.xlsx"')
  async platformTenantsExportExcel(
    @Query('tenantIds', new ParseArrayPipe({ optional: true })) tenantIds?: string[],
  ) {
    return this.reportsService.platformTenantReportExcel(tenantIds);
  }

  // ---------------------------------------------------------------------
  // Tenant-scoped reports (COMPANY_ADMIN / HR_MANAGER) — scoped to the
  // caller's own tenant via JWT, full detail is fine.
  // ---------------------------------------------------------------------

  @Get('tenant/employees')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  tenantEmployees(@Req() req: AuthedRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.tenantEmployeesReport(req.user, from, to);
  }

  @Get('tenant/employees/export-excel')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="employees-report.xlsx"')
  tenantEmployeesExportExcel(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.tenantEmployeesReportExcel(req.user, from, to);
  }

  @Get('tenant/leave')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  tenantLeave(@Req() req: AuthedRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.tenantLeaveReport(req.user, from, to);
  }

  @Get('tenant/leave/export-excel')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="leave-report.xlsx"')
  tenantLeaveExportExcel(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.tenantLeaveReportExcel(req.user, from, to);
  }

  @Get('tenant/attendance')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  tenantAttendance(@Req() req: AuthedRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.tenantAttendanceReport(req.user, from, to);
  }

  @Get('tenant/attendance/export-excel')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="attendance-report.xlsx"')
  tenantAttendanceExportExcel(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.tenantAttendanceReportExcel(req.user, from, to);
  }

  @Get('tenant/payroll')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  tenantPayroll(@Req() req: AuthedRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.tenantPayrollReport(req.user, from, to);
  }

  @Get('tenant/payroll/export-excel')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="payroll-report.xlsx"')
  tenantPayrollExportExcel(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reportsService.tenantPayrollReportExcel(req.user, from, to);
  }
}
