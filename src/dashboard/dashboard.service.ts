import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePlan } from '../tenant-configuration/tenant-configuration.constants';
import { TenantConfigurationService } from '../tenant-configuration/tenant-configuration.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantConfigurationService: TenantConfigurationService,
  ) {}

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
      suspendedTenants,
      totalEmployees,
      totalPayrollRuns,
      activeUsers,
      inactiveUsers,
      leadPending,
      leadConverted,
      leadDeleted,
      users,
      tenantPlans,
      payingTenants,
    ] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.employee.count(),
      this.prisma.payrollRun.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
      this.prisma.user.count({ where: { status: 'INACTIVE' } }),
      this.prisma.tenant.count({ where: { leadStatus: 'PENDING' } }),
      this.prisma.tenant.count({ where: { leadStatus: 'CONVERTED' } }),
      this.prisma.tenant.count({ where: { leadStatus: 'DELETED' } }),
      this.prisma.user.findMany({ select: { createdAt: true } }),
      this.prisma.tenant.findMany({
        select: {
          id: true,
          name: true,
          companyCode: true,
          plan: true,
          status: true,
          leadStatus: true,
          seats: true,
          createdAt: true,
        },
      }),
      this.prisma.tenant.count({
        where: {
          status: 'ACTIVE',
          leadStatus: 'CONVERTED',
          plan: { notIn: ['FREEMIUM', ''] },
        },
      }),
    ]);

    // Calculate platform revenue (mock: $50/tenant/month base + $0.10/employee/month)
    const totalRevenue = tenants * 50 + Math.max(totalEmployees * 0.1, 0);
    const months = this.buildMonthLabels();
    const growthSeries = this.buildMonthlySeries(users.map((user) => user.createdAt));
    const planCatalog = await this.tenantConfigurationService.getPlatformPlanCatalog();
    const planCounts = Array.from(
      tenantPlans.reduce((acc, tenant) => {
        const key = normalizePlan(tenant.plan?.trim() || 'UNSPECIFIED');
        acc.set(key, (acc.get(key) ?? 0) + 1);
        return acc;
      }, new Map<string, number>()),
      ([key, value]) => ({
        label: key === 'UNSPECIFIED' ? 'Unspecified' : this.tenantConfigurationService.planLabelFromCatalog(planCatalog, key),
        value,
      }),
    ).sort((a, b) => b.value - a.value);

    const palette = ['#f47421', '#10b7c7', '#55bf67', '#f6a912', '#e048b2', '#8b98b7'];

    const [userCounts, employeeCounts, pendingLeadRows] = await Promise.all([
      this.prisma.user.groupBy({
        by: ['tenantId'],
        where: { status: 'ACTIVE', tenantId: { not: null } },
        _count: { id: true },
      }),
      this.prisma.employee.groupBy({
        by: ['tenantId'],
        _count: { id: true },
      }),
      this.prisma.tenant.findMany({
        where: { leadStatus: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          companyCode: true,
          plan: true,
          createdAt: true,
          config: true,
        },
      }),
    ]);

    const usersByTenant = new Map(
      userCounts
        .filter((row) => row.tenantId !== null)
        .map((row) => [row.tenantId as number, row._count.id]),
    );
    const employeesByTenant = new Map(employeeCounts.map((row) => [row.tenantId, row._count.id]));

    const billingReport = tenantPlans
      .filter((tenant) => tenant.leadStatus === 'CONVERTED' || tenant.status === 'ACTIVE')
      .map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        companyCode: tenant.companyCode ?? '',
        plan: tenant.plan,
        planLabel: this.tenantConfigurationService.planLabelFromCatalog(planCatalog, tenant.plan),
        status: tenant.status,
        leadStatus: tenant.leadStatus,
        activeUsers: usersByTenant.get(tenant.id) ?? 0,
        activeEmployees: employeesByTenant.get(tenant.id) ?? 0,
        includedSeats: tenant.seats,
      }))
      .sort((a, b) => b.activeUsers - a.activeUsers);

    const pendingLeads = pendingLeadRows.map((tenant) => {
      const leadDetails =
        tenant.config &&
        typeof tenant.config === 'object' &&
        !Array.isArray(tenant.config) &&
        typeof (tenant.config as Record<string, unknown>).leadDetails === 'object'
          ? ((tenant.config as Record<string, unknown>).leadDetails as Record<string, unknown>)
          : {};

      return {
        id: tenant.id,
        name: tenant.name,
        companyCode: tenant.companyCode ?? '',
        plan:
          typeof leadDetails.requestedPlan === 'string'
            ? leadDetails.requestedPlan
            : tenant.plan,
        adminEmail:
          typeof leadDetails.adminEmail === 'string' ? leadDetails.adminEmail : null,
        employeeCount:
          typeof leadDetails.employeeCount === 'number' ? leadDetails.employeeCount : null,
        createdAt: tenant.createdAt,
      };
    });

    return {
      tenants,
      activeTenants,
      suspendedTenants,
      totalEmployees,
      totalPayrollRuns,
      totalUsers: activeUsers,
      activeUsers,
      inactiveUsers,
      payingTenants,
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
        planLabel: this.tenantConfigurationService.planLabelFromCatalog(planCatalog, tenant.plan),
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
      billingReport,
      pendingLeads,
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

  private buildLeaveTrendSeries(
    leaveRows: Array<{ startDate: Date; status: string }>,
    monthsBack = 7,
  ): number[] {
    const approvedOnly = leaveRows.filter((r) => r.status === 'APPROVED');
    return this.buildMonthlySeries(approvedOnly.map((r) => r.startDate), monthsBack);
  }

  async companyAdminMetrics(tenantId: number) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const [
      employees,
      leavePending,
      payrollRuns,
      employeeRows,
      attendanceRows,
      payrollRows,
      openPositionsCount,
      recentHires,
      leaveRows,
      recruitmentPipeline,
      currentMonthPayroll,
      todayAttendance,
    ] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId, deletedAt: null } }),
      this.prisma.leaveRequest.count({
        where: { status: 'PENDING', employee: { tenantId } },
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
      // Recent hires — last 5 joined employees
      this.prisma.employee.findMany({
        where: { tenantId, deletedAt: null },
        orderBy: { joinedDate: 'desc' },
        take: 5,
        select: {
          id: true,
          employeeCode: true,
          designation: true,
          department: true,
          joinedDate: true,
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      // Leave trend (last 7 months approved leaves)
      this.prisma.leaveRequest.findMany({
        where: { employee: { tenantId } },
        select: { startDate: true, status: true },
      }),
      // Recruitment funnel by pipeline stage
      this.prisma.candidate.groupBy({
        by: ['stage'],
        where: { tenantId },
        _count: { id: true },
      }),
      // Current month payroll burn rate
      this.prisma.payrollRun.aggregate({
        where: {
          tenantId,
          status: 'COMPLETED',
          processedAt: { gte: monthStart, lte: monthEnd },
        },
        _sum: { grossAmount: true },
      }),
      // Today's attendance count
      this.prisma.attendance.count({
        where: {
          employee: { tenantId },
          date: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: new Date(new Date().setHours(23, 59, 59, 999)),
          },
        },
      }),
    ]);

    const totalEmployees = employees;
    const monthlyBurnRate = currentMonthPayroll._sum.grossAmount ?? 0;
    const attendancePct = totalEmployees > 0 ? Math.round((todayAttendance / totalEmployees) * 100) : 0;

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
    const leaveTrendSeries = this.buildLeaveTrendSeries(leaveRows);

    const stageOrder = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED'];
    const recruitmentFunnel = stageOrder.map((stage) => ({
      stage,
      count: recruitmentPipeline.find((r) => r.stage === stage)?._count?.id ?? 0,
    }));

    return {
      employees,
      leavePending,
      payrollRuns,
      openPositions: openPositionsCount,
      monthlyBurnRate,
      attendancePct,
      months,
      growthSeries,
      splitSeries,
      attendanceLabels,
      attendanceSeries,
      payrollLabels: payrollSnapshot.labels,
      payrollRunsSeries: payrollSnapshot.runSeries,
      payrollAmountSeries: payrollSnapshot.amountSeries,
      leaveTrendSeries,
      recentHires,
      recruitmentFunnel,
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
      select: { id: true, tenantId: true },
    });

    if (!employee) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    return this.employeeMetrics(employee.id, employee.tenantId);
  }

  async employeeMetrics(employeeId: number, tenantId?: number) {
    const profile = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        leaveRequests: { orderBy: { createdAt: 'desc' }, take: 5 },
        attendance: { orderBy: { date: 'desc' }, take: 7 },
        payslips: { orderBy: { id: 'desc' }, take: 5 },
      },
    });

    if (!profile || !tenantId) {
      return profile;
    }

    // Team birthdays: colleagues with DOB in the next 30 days
    const today = new Date();
    const teamBirthdays = await this.getUpcomingBirthdays(tenantId, employeeId, 30);

    // Sri Lanka public holidays (static list for current year)
    const upcomingHolidays = this.getSriLankaUpcomingHolidays(today, 5);

    return {
      ...profile,
      teamBirthdays,
      upcomingHolidays,
    };
  }

  private async getUpcomingBirthdays(
    tenantId: number,
    excludeEmployeeId: number,
    daysAhead: number,
  ) {
    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        deletedAt: null,
        id: { not: excludeEmployeeId },
        dateOfBirth: { not: null },
      },
      select: {
        id: true,
        dateOfBirth: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming: Array<{ name: string; date: string; daysUntil: number }> = [];

    for (const emp of employees) {
      if (!emp.dateOfBirth) continue;
      const dob = new Date(emp.dateOfBirth);
      const thisYearBirthday = new Date(today.getFullYear(), dob.getMonth(), dob.getDate());

      if (thisYearBirthday < today) {
        thisYearBirthday.setFullYear(today.getFullYear() + 1);
      }

      const daysUntil = Math.round(
        (thisYearBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysUntil <= daysAhead) {
        upcoming.push({
          name: `${emp.user?.firstName ?? ''} ${emp.user?.lastName ?? ''}`.trim() || `Employee #${emp.id}`,
          date: thisYearBirthday.toISOString().split('T')[0],
          daysUntil,
        });
      }
    }

    return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  }

  private getSriLankaUpcomingHolidays(
    from: Date,
    take: number,
  ): Array<{ name: string; date: string; daysUntil: number }> {
    const year = from.getFullYear();
    const holidays = [
      { name: 'Thai Pongal', month: 1, day: 14 },
      { name: 'Independence Day', month: 2, day: 4 },
      { name: 'Maha Sivarathri', month: 2, day: 26 },
      { name: 'Milad un Nabi', month: 3, day: 31 },
      { name: 'Sinhala & Tamil New Year', month: 4, day: 13 },
      { name: 'Sinhala & Tamil New Year (Holiday)', month: 4, day: 14 },
      { name: 'Labour Day', month: 5, day: 1 },
      { name: 'Vesak Full Moon Poya', month: 5, day: 12 },
      { name: 'Poson Full Moon Poya', month: 6, day: 11 },
      { name: 'Esala Full Moon Poya', month: 7, day: 10 },
      { name: 'Nikini Full Moon Poya', month: 8, day: 9 },
      { name: 'Binara Full Moon Poya', month: 9, day: 7 },
      { name: 'Vap Full Moon Poya', month: 10, day: 6 },
      { name: 'Deepavali', month: 10, day: 20 },
      { name: 'Ill Full Moon Poya', month: 11, day: 5 },
      { name: 'Christmas Day', month: 12, day: 25 },
      { name: 'Unduvap Full Moon Poya', month: 12, day: 4 },
    ];

    const today = new Date(from);
    today.setHours(0, 0, 0, 0);

    const result: Array<{ name: string; date: string; daysUntil: number }> = [];

    for (const h of holidays) {
      let hDate = new Date(year, h.month - 1, h.day);
      if (hDate < today) {
        hDate = new Date(year + 1, h.month - 1, h.day);
      }

      const daysUntil = Math.round(
        (hDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      result.push({ name: h.name, date: hDate.toISOString().split('T')[0], daysUntil });
    }

    return result
      .filter((h) => h.daysUntil >= 0)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, take);
  }
}
