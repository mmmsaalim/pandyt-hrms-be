import {
  Controller,
  Get,
  Header,
  ParseArrayPipe,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';

type AuthedRequest = { user?: { sub: number; roles?: string[]; tenantId?: number } };

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @RequirePermissions('reports.read')
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
    const buffer = await this.reportsService.platformTenantReportExcel(tenantIds);
    return new StreamableFile(buffer);
  }

  // ---------------------------------------------------------------------
  // Tenant-scoped reports (COMPANY_ADMIN / HR_MANAGER) — scoped to the
  // caller's own tenant via JWT, full detail is fine.
  // ---------------------------------------------------------------------

  @Get('tenant/employees')
  @RequirePermissions('reports.read')
  tenantEmployees(@Req() req: AuthedRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.tenantEmployeesReport(req.user, from, to);
  }

  @Get('tenant/employees/export-excel')
  @RequirePermissions('reports.read')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="employees-report.xlsx"')
  async tenantEmployeesExportExcel(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const buffer = await this.reportsService.tenantEmployeesReportExcel(req.user, from, to);
    return new StreamableFile(buffer);
  }

  @Get('tenant/leave')
  @RequirePermissions('reports.read')
  tenantLeave(@Req() req: AuthedRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.tenantLeaveReport(req.user, from, to);
  }

  @Get('tenant/leave/export-excel')
  @RequirePermissions('reports.read')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="leave-report.xlsx"')
  async tenantLeaveExportExcel(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const buffer = await this.reportsService.tenantLeaveReportExcel(req.user, from, to);
    return new StreamableFile(buffer);
  }

  @Get('tenant/attendance')
  @RequirePermissions('reports.read')
  tenantAttendance(@Req() req: AuthedRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.tenantAttendanceReport(req.user, from, to);
  }

  @Get('tenant/attendance/export-excel')
  @RequirePermissions('reports.read')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="attendance-report.xlsx"')
  async tenantAttendanceExportExcel(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const buffer = await this.reportsService.tenantAttendanceReportExcel(req.user, from, to);
    return new StreamableFile(buffer);
  }

  @Get('tenant/payroll')
  @RequirePermissions('reports.read')
  tenantPayroll(@Req() req: AuthedRequest, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reportsService.tenantPayrollReport(req.user, from, to);
  }

  @Get('tenant/payroll/export-excel')
  @RequirePermissions('reports.read')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="payroll-report.xlsx"')
  async tenantPayrollExportExcel(
    @Req() req: AuthedRequest,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const buffer = await this.reportsService.tenantPayrollReportExcel(req.user, from, to);
    return new StreamableFile(buffer);
  }
}
