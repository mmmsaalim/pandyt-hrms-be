import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private monthLabel(date: Date): string {
    return date.toLocaleString('en-GB', { month: 'short' });
  }

  private buildMonthLabels(monthsBack = 7): string[] {
    const labels: string[] = [];
    const now = new Date();

    for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
      labels.push(this.monthLabel(new Date(now.getFullYear(), now.getMonth() - offset, 1)));
    }

    return labels;
  }

  private monthKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}`;
  }

  private buildMonthlySeries(dates: Date[], monthsBack = 7): number[] {
    const counts = new Map<string, number>();
    for (const date of dates) {
      const key = this.monthKey(date);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const now = new Date();
    const series: number[] = [];

    for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      series.push(counts.get(this.monthKey(date)) ?? 0);
    }

    return series;
  }

  private buildSplitSeries(
    labels: string[],
    values: string[],
    palette: string[],
  ): Array<{ label: string; value: number; color: string }> {
    const counts = new Map<string, number>();
    for (const value of values) {
      const key = value?.trim() || 'Other';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    return labels.map((label, index) => ({
      label,
      value: counts.get(label) ?? 0,
      color: palette[index % palette.length],
    }));
  }

  private buildAttendanceSeries(attendance: Array<{ date: Date }>): number[] {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const now = new Date();
    const mondayOffset = (now.getDay() + 6) % 7;
    const start = new Date(now);
    start.setDate(now.getDate() - mondayOffset);
    start.setHours(0, 0, 0, 0);

    const friday = new Date(start);
    friday.setDate(start.getDate() + 4);
    friday.setHours(23, 59, 59, 999);

    return labels.map((_, index) => {
      const day = new Date(start);
      day.setDate(start.getDate() + index);
      const key = day.toDateString();

      return attendance.filter((row) => {
        const attendanceDay = new Date(row.date);
        attendanceDay.setHours(0, 0, 0, 0);
        return attendanceDay.toDateString() === key && attendanceDay >= start && attendanceDay <= friday;
      }).length;
    });
  }

  private buildPayrollSeries(payrollRuns: Array<{ processedAt: Date | null; grossAmount: number }>) {
    const labels = this.buildMonthLabels();
    const monthsBack = labels.length;
    const now = new Date();
    const buckets = new Map<string, { runs: number; grossAmount: number }>();

    for (const payroll of payrollRuns) {
      if (!payroll.processedAt) {
        continue;
      }

      const key = this.monthKey(payroll.processedAt);
      const current = buckets.get(key) ?? { runs: 0, grossAmount: 0 };
      buckets.set(key, {
        runs: current.runs + 1,
        grossAmount: current.grossAmount + payroll.grossAmount,
      });
    }

    const runSeries: number[] = [];
    const amountSeries: number[] = [];

    for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const bucket = buckets.get(this.monthKey(date)) ?? { runs: 0, grossAmount: 0 };
      runSeries.push(bucket.runs);
      amountSeries.push(Math.round(bucket.grossAmount));
    }

    return { labels, runSeries, amountSeries };
  }

  async superAdminMetrics() {
    const [
      tenants,
      activeTenants,
      totalEmployees,
      totalPayrollRuns,
      totalUsers,
      leadPending,
      leadConverted,
      leadDeleted,
      users,
      tenantPlans,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.employee.count(),
      this.prisma.payrollRun.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.tenant.count({ where: { leadStatus: 'PENDING' } }),
      this.prisma.tenant.count({ where: { leadStatus: 'CONVERTED' } }),
      this.prisma.tenant.count({ where: { leadStatus: 'DELETED' } }),
      this.prisma.user.findMany({ select: { createdAt: true } }),
      this.prisma.tenant.findMany({
        select: { id: true, name: true, companyCode: true, plan: true, status: true, leadStatus: true, seats: true, createdAt: true },
      }),
    ]);

    // Calculate platform revenue (mock: $50/tenant/month base + $0.10/employee/month)
    const totalRevenue = tenants * 50 + Math.max(totalEmployees * 0.1, 0);
    const months = this.buildMonthLabels();
    const growthSeries = this.buildMonthlySeries(users.map((user) => user.createdAt));
    const planCounts = Array.from(
      tenantPlans.reduce((acc, tenant) => {
        const key = tenant.plan?.trim() || 'Unspecified';
        acc.set(key, (acc.get(key) ?? 0) + 1);
        return acc;
      }, new Map<string, number>()),
      ([label, value]) => ({
        label,
        value,
      }),
    ).sort((a, b) => b.value - a.value);

    const palette = ['#f47421', '#10b7c7', '#55bf67', '#f6a912', '#e048b2', '#8b98b7'];

    return {
      tenants,
      activeTenants,
      totalEmployees,
      totalPayrollRuns,
      totalUsers,
      totalRevenue,
      months,
      growthSeries,
      splitSeries: planCounts.map((item, index) => ({
        label: item.label,
        value: item.value,
        color: palette[index % palette.length],
      })),
      tenantsList: tenantPlans.map((tenant: { id: number; name: string; companyCode: string | null; plan: string; status: string; leadStatus: string; createdAt: Date; seats: number }) => ({
        id: tenant.id,
        name: tenant.name,
        companyCode: tenant.companyCode ?? '',
        plan: tenant.plan,
        status: tenant.status,
        leadStatus: tenant.leadStatus,
        createdAt: tenant.createdAt,
        seats: tenant.seats
      })),
      leads: {
        pending: leadPending,
        converted: leadConverted,
        deleted: leadDeleted,
      },
    };
  }

  private async resolveTenantForCompanyAdmin(userId: number): Promise<number> {
    const employeeProfile = await this.prisma.employee.findUnique({
      where: { userId },
      select: { tenantId: true },
    });

    if (!employeeProfile) {
      throw new ForbiddenException(
        'Company admin is not mapped to a tenant employee profile.',
      );
    }

    return employeeProfile.tenantId;
  }

  async companyAdminMetrics(tenantId: number) {
    const [employees, leavePending, payrollRuns, employeeRows, attendanceRows, payrollRows, openPositionsCount] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId } }),
      this.prisma.leaveRequest.count({
        where: {
          status: 'PENDING',
          employee: { tenantId },
        },
      }),
      this.prisma.payrollRun.count({ where: { tenantId } }),
      this.prisma.employee.findMany({
        where: { tenantId },
        select: { joinedDate: true, department: true },
      }),
      this.prisma.attendance.findMany({
        where: { employee: { tenantId } },
        select: { date: true },
      }),
      this.prisma.payrollRun.findMany({
        where: { tenantId },
        select: { processedAt: true, grossAmount: true },
      }),
      this.prisma.jobPost.count({ where: { tenantId, status: 'OPEN' } }),
    ]);

    const months = this.buildMonthLabels();
    const growthSeries = this.buildMonthlySeries(employeeRows.map((employee) => employee.joinedDate));
    const departmentNames = Array.from(
      new Set(employeeRows.map((employee) => employee.department?.trim() || 'Unassigned')),
    ).sort((a, b) => a.localeCompare(b));
    const splitSeries = this.buildSplitSeries(
      departmentNames,
      employeeRows.map((employee) => employee.department?.trim() || 'Unassigned'),
      ['#f47421', '#10b7c7', '#55bf67', '#f6a912', '#e048b2', '#8b98b7'],
    );
    const attendanceLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const attendanceSeries = this.buildAttendanceSeries(attendanceRows);
    const payrollSnapshot = this.buildPayrollSeries(payrollRows);

    return {
      employees,
      leavePending,
      payrollRuns,
      openPositions: openPositionsCount,
      months,
      growthSeries,
      splitSeries,
      attendanceLabels,
      attendanceSeries,
      payrollLabels: payrollSnapshot.labels,
      payrollRunsSeries: payrollSnapshot.runSeries,
      payrollAmountSeries: payrollSnapshot.amountSeries,
    };
  }

  async companyAdminMetricsForUser(
    userId: number,
    roles: string[],
    tenantId?: number,
  ) {
    if (roles.includes('SUPER_ADMIN')) {
      if (!tenantId) {
        return this.superAdminMetrics();
      }

      return this.companyAdminMetrics(tenantId);
    }

    const scopedTenantId = await this.resolveTenantForCompanyAdmin(userId);

    if (roles.includes('HR_MANAGER') || roles.includes('COMPANY_ADMIN')) {
      return this.companyAdminMetrics(scopedTenantId);
    }

    if (roles.includes('TEAM_LEAD')) {
      return this.teamLeadMetrics(userId, scopedTenantId);
    }

    throw new ForbiddenException('Unauthorized role access for dashboard metrics.');
  }

  async teamLeadMetrics(userId: number, tenantId: number) {
    const teamLeadEmployee = await this.prisma.employee.findUnique({
      where: { userId, tenantId },
      select: { id: true },
    });

    if (!teamLeadEmployee) {
      throw new ForbiddenException('Team Lead employee profile not found.');
    }

    const directReports = await this.prisma.employee.findMany({
      where: { managerId: teamLeadEmployee.id, tenantId },
      select: { id: true, joinedDate: true, department: true },
    });

    const directReportIds = directReports.map(emp => emp.id);

    const [
      employeesCount,
      leavePendingCount,
      attendanceRows,
    ] = await Promise.all([
      this.prisma.employee.count({ where: { id: { in: directReportIds }, tenantId } }),
      this.prisma.leaveRequest.count({
        where: {
          status: 'PENDING',
          employeeId: { in: directReportIds },
          employee: { tenantId },
        },
      }),
      this.prisma.attendance.findMany({
        where: { employeeId: { in: directReportIds }, employee: { tenantId } },
        select: { date: true },
      }),
    ]);

    const months = this.buildMonthLabels();
    const growthSeries = this.buildMonthlySeries(directReports.map(emp => emp.joinedDate));

    const departmentNames = Array.from(
      new Set(directReports.map((employee) => employee.department?.trim() || 'Unassigned')),
    ).sort((a, b) => a.localeCompare(b));
    const splitSeries = this.buildSplitSeries(
      departmentNames,
      directReports.map((employee) => employee.department?.trim() || 'Unassigned'),
      ['#f47421', '#10b7c7', '#55bf67', '#f6a912', '#e048b2', '#8b98b7'],
    );

    const attendanceLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const attendanceSeries = this.buildAttendanceSeries(attendanceRows);

    const payrollSnapshot = { labels: [], runSeries: [], amountSeries: [] };

    return {
      employees: employeesCount,
      leavePending: leavePendingCount,
      payrollRuns: 0,
      openPositions: 0,
      months,
      growthSeries,
      splitSeries,
      attendanceLabels,
      attendanceSeries,
      payrollLabels: payrollSnapshot.labels,
      payrollRunsSeries: payrollSnapshot.runSeries,
      payrollAmountSeries: payrollSnapshot.amountSeries,
    };
  }

  async employeeMetricsByUser(userId: number) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!employee) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    return this.employeeMetrics(employee.id);
  }

  employeeMetrics(employeeId: number) {
    return this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        leaveRequests: { orderBy: { createdAt: 'desc' }, take: 5 },
        attendance: { orderBy: { date: 'desc' }, take: 7 },
        payslips: { orderBy: { id: 'desc' }, take: 5 },
      },
    });
  }
}
