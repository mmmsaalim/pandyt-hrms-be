import { ForbiddenException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';

type DateRange = { from?: Date; to?: Date };

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private requireTenant(user: { tenantId?: number } | undefined): number {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required.');
    }

    return tenantId;
  }

  /** Parses optional `from`/`to` query strings into an inclusive UTC date range. */
  private parseDateRange(from?: string, to?: string): DateRange {
    const range: DateRange = {};

    if (from) {
      const parsed = new Date(from);
      if (!Number.isNaN(parsed.getTime())) {
        range.from = parsed;
      }
    }

    if (to) {
      const parsed = new Date(to);
      if (!Number.isNaN(parsed.getTime())) {
        // Include the entire "to" day.
        parsed.setHours(23, 59, 59, 999);
        range.to = parsed;
      }
    }

    return range;
  }

  private async workbookToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }

  private buildWorkbook(
    sheetName: string,
    columns: Partial<ExcelJS.Column>[],
    rows: Record<string, unknown>[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.columns = columns;
    worksheet.getRow(1).font = { bold: true };
    rows.forEach((row) => worksheet.addRow(row));
    return this.workbookToBuffer(workbook);
  }

  async summary(user: { tenantId?: number } | undefined) {
    const tenantId = this.requireTenant(user);

    const [employees, leaves, payrollRuns] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId } }),
      this.prisma.leaveRequest.count({ where: { employee: { tenantId } } }),
      this.prisma.payrollRun.count({ where: { tenantId } }),
    ]);

    return { employees, leaves, payrollRuns };
  }

  // ---------------------------------------------------------------------
  // Platform-level report (SUPER_ADMIN). Tenant/plan/user-count only — no
  // per-tenant user detail is exposed here, to keep other tenants' user
  // data private in this multi-tenant product.
  // ---------------------------------------------------------------------

  async platformTenantReport() {
    const [tenants, activeUserCounts, inactiveUserCounts, employeeCounts] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { leadStatus: 'CONVERTED' },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          companyCode: true,
          plan: true,
          status: true,
          seats: true,
          createdAt: true,
        },
      }),
      this.prisma.user.groupBy({
        by: ['tenantId'],
        where: { status: 'ACTIVE', tenantId: { not: null } },
        _count: { id: true },
      }),
      this.prisma.user.groupBy({
        by: ['tenantId'],
        where: { status: 'INACTIVE', tenantId: { not: null } },
        _count: { id: true },
      }),
      this.prisma.employee.groupBy({
        by: ['tenantId'],
        _count: { id: true },
      }),
    ]);

    const activeUsersByTenant = new Map(
      activeUserCounts
        .filter((row) => row.tenantId !== null)
        .map((row) => [row.tenantId as number, row._count.id]),
    );
    const inactiveUsersByTenant = new Map(
      inactiveUserCounts
        .filter((row) => row.tenantId !== null)
        .map((row) => [row.tenantId as number, row._count.id]),
    );
    const employeesByTenant = new Map(employeeCounts.map((row) => [row.tenantId, row._count.id]));

    return tenants.map((tenant) => ({
      id: tenant.id,
      name: tenant.name,
      companyCode: tenant.companyCode ?? '',
      plan: tenant.plan,
      status: tenant.status,
      seats: tenant.seats,
      activeUsers: activeUsersByTenant.get(tenant.id) ?? 0,
      inactiveUsers: inactiveUsersByTenant.get(tenant.id) ?? 0,
      activeEmployees: employeesByTenant.get(tenant.id) ?? 0,
      createdAt: tenant.createdAt,
    }));
  }

  async platformTenantReportExcel(tenantIds?: (string | number)[]): Promise<Buffer> {
    const rows = await this.platformTenantReport();
    const numericIds = tenantIds?.map((id) => Number(id)).filter((id) => !Number.isNaN(id));
    const filtered = numericIds?.length ? rows.filter((row) => numericIds.includes(row.id)) : rows;

    return this.buildWorkbook(
      'Tenant Report',
      [
        { header: 'Company', key: 'name', width: 28 },
        { header: 'Code', key: 'companyCode', width: 18 },
        { header: 'Plan', key: 'plan', width: 14 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Seats', key: 'seats', width: 10 },
        { header: 'Active Users', key: 'activeUsers', width: 14 },
        { header: 'Inactive Users', key: 'inactiveUsers', width: 14 },
        { header: 'Employees', key: 'activeEmployees', width: 12 },
      ],
      filtered,
    );
  }

  // ---------------------------------------------------------------------
  // Tenant-scoped reports (COMPANY_ADMIN / HR_MANAGER). Scoped to the
  // caller's own tenant, so full employee/user detail is fine here.
  // ---------------------------------------------------------------------

  async tenantEmployeesReport(
    user: { tenantId?: number } | undefined,
    from?: string,
    to?: string,
  ) {
    const tenantId = this.requireTenant(user);
    const range = this.parseDateRange(from, to);

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(range.from || range.to
          ? {
              joinedDate: {
                ...(range.from ? { gte: range.from } : {}),
                ...(range.to ? { lte: range.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { joinedDate: 'desc' },
      select: {
        employeeCode: true,
        department: true,
        designation: true,
        joinedDate: true,
        employmentStatus: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
    });

    return employees.map((employee) => ({
      employeeCode: employee.employeeCode,
      name: `${employee.user.firstName ?? ''} ${employee.user.lastName ?? ''}`.trim(),
      email: employee.user.email,
      department: employee.department,
      designation: employee.designation,
      joinedDate: employee.joinedDate,
      employmentStatus: employee.employmentStatus,
    }));
  }

  async tenantLeaveReport(user: { tenantId?: number } | undefined, from?: string, to?: string) {
    const tenantId = this.requireTenant(user);
    const range = this.parseDateRange(from, to);

    const leaves = await this.prisma.leaveRequest.findMany({
      where: {
        employee: { tenantId },
        ...(range.from || range.to
          ? {
              startDate: {
                ...(range.from ? { gte: range.from } : {}),
                ...(range.to ? { lte: range.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { startDate: 'desc' },
      select: {
        type: true,
        startDate: true,
        endDate: true,
        days: true,
        status: true,
        reason: true,
        employee: {
          select: {
            employeeCode: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    return leaves.map((leave) => ({
      employeeCode: leave.employee.employeeCode,
      employeeName: `${leave.employee.user.firstName ?? ''} ${leave.employee.user.lastName ?? ''}`.trim(),
      type: leave.type,
      startDate: leave.startDate,
      endDate: leave.endDate,
      days: leave.days,
      status: leave.status,
      reason: leave.reason,
    }));
  }

  async tenantAttendanceReport(
    user: { tenantId?: number } | undefined,
    from?: string,
    to?: string,
  ) {
    const tenantId = this.requireTenant(user);
    const range = this.parseDateRange(from, to);

    const records = await this.prisma.attendance.findMany({
      where: {
        employee: { tenantId },
        ...(range.from || range.to
          ? {
              date: {
                ...(range.from ? { gte: range.from } : {}),
                ...(range.to ? { lte: range.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { date: 'desc' },
      select: {
        date: true,
        clockIn: true,
        clockOut: true,
        hours: true,
        status: true,
        lateMinutes: true,
        earlyDepartureMinutes: true,
        overtimeHours: true,
        employee: {
          select: {
            employeeCode: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    return records.map((record) => ({
      employeeCode: record.employee.employeeCode,
      employeeName: `${record.employee.user.firstName ?? ''} ${record.employee.user.lastName ?? ''}`.trim(),
      date: record.date,
      clockIn: record.clockIn,
      clockOut: record.clockOut,
      hours: record.hours,
      status: record.status,
      lateMinutes: record.lateMinutes,
      earlyDepartureMinutes: record.earlyDepartureMinutes,
      overtimeHours: record.overtimeHours,
    }));
  }

  async tenantPayrollReport(user: { tenantId?: number } | undefined, from?: string, to?: string) {
    const tenantId = this.requireTenant(user);
    const range = this.parseDateRange(from, to);

    const runs = await this.prisma.payrollRun.findMany({
      where: {
        tenantId,
        ...(range.from || range.to
          ? {
              processedAt: {
                ...(range.from ? { gte: range.from } : {}),
                ...(range.to ? { lte: range.to } : {}),
              },
            }
          : {}),
      },
      orderBy: { processedAt: 'desc' },
      select: {
        period: true,
        grossAmount: true,
        netAmount: true,
        status: true,
        processedAt: true,
      },
    });

    return runs;
  }

  async tenantEmployeesReportExcel(user: { tenantId?: number } | undefined, from?: string, to?: string) {
    const rows = await this.tenantEmployeesReport(user, from, to);
    return this.buildWorkbook(
      'Employees',
      [
        { header: 'Employee Code', key: 'employeeCode', width: 16 },
        { header: 'Name', key: 'name', width: 24 },
        { header: 'Email', key: 'email', width: 28 },
        { header: 'Department', key: 'department', width: 18 },
        { header: 'Designation', key: 'designation', width: 18 },
        { header: 'Joined Date', key: 'joinedDate', width: 14 },
        { header: 'Employment Status', key: 'employmentStatus', width: 16 },
      ],
      rows,
    );
  }

  async tenantLeaveReportExcel(user: { tenantId?: number } | undefined, from?: string, to?: string) {
    const rows = await this.tenantLeaveReport(user, from, to);
    return this.buildWorkbook(
      'Leave',
      [
        { header: 'Employee Code', key: 'employeeCode', width: 16 },
        { header: 'Employee Name', key: 'employeeName', width: 24 },
        { header: 'Type', key: 'type', width: 14 },
        { header: 'Start Date', key: 'startDate', width: 14 },
        { header: 'End Date', key: 'endDate', width: 14 },
        { header: 'Days', key: 'days', width: 10 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Reason', key: 'reason', width: 30 },
      ],
      rows,
    );
  }

  async tenantAttendanceReportExcel(user: { tenantId?: number } | undefined, from?: string, to?: string) {
    const rows = await this.tenantAttendanceReport(user, from, to);
    return this.buildWorkbook(
      'Attendance',
      [
        { header: 'Employee Code', key: 'employeeCode', width: 16 },
        { header: 'Employee Name', key: 'employeeName', width: 24 },
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Clock In', key: 'clockIn', width: 18 },
        { header: 'Clock Out', key: 'clockOut', width: 18 },
        { header: 'Hours', key: 'hours', width: 10 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Late (min)', key: 'lateMinutes', width: 12 },
        { header: 'Early Departure (min)', key: 'earlyDepartureMinutes', width: 16 },
        { header: 'Overtime (hrs)', key: 'overtimeHours', width: 14 },
      ],
      rows,
    );
  }

  async tenantPayrollReportExcel(user: { tenantId?: number } | undefined, from?: string, to?: string) {
    const rows = await this.tenantPayrollReport(user, from, to);
    return this.buildWorkbook(
      'Payroll',
      [
        { header: 'Period', key: 'period', width: 16 },
        { header: 'Gross Amount', key: 'grossAmount', width: 16 },
        { header: 'Net Amount', key: 'netAmount', width: 16 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Processed At', key: 'processedAt', width: 18 },
      ],
      rows,
    );
  }
}
