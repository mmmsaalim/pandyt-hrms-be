import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async superAdminMetrics() {
    const [tenants, activeTenants, totalEmployees, totalPayrollRuns, totalUsers] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.employee.count(),
      this.prisma.payrollRun.count(),
      this.prisma.user.count({ where: { status: 'ACTIVE' } }),
    ]);

    // Calculate platform revenue (mock: $50/tenant/month base + $0.10/employee/month)
    const totalRevenue = tenants * 50 + Math.max(totalEmployees * 0.1, 0);

    return { tenants, activeTenants, totalEmployees, totalPayrollRuns, totalUsers, totalRevenue };
  }

  private async resolveTenantForCompanyAdmin(userId: string): Promise<string> {
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

  async companyAdminMetrics(tenantId: string) {
    const [employees, leavePending, payrollRuns] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId } }),
      this.prisma.leaveRequest.count({
        where: {
          status: 'PENDING',
          employee: { tenantId },
        },
      }),
      this.prisma.payrollRun.count({ where: { tenantId } }),
    ]);

    return { employees, leavePending, payrollRuns };
  }

  async companyAdminMetricsForUser(
    userId: string,
    roles: string[],
    tenantId?: string,
  ) {
    if (roles.includes('SUPER_ADMIN')) {
      if (!tenantId) {
        return this.superAdminMetrics();
      }

      return this.companyAdminMetrics(tenantId);
    }

    const scopedTenantId = await this.resolveTenantForCompanyAdmin(userId);
    return this.companyAdminMetrics(scopedTenantId);
  }

  async employeeMetricsByUser(userId: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!employee) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    return this.employeeMetrics(employee.id);
  }

  employeeMetrics(employeeId: string) {
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
