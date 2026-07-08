import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

  async summary(user: { tenantId?: number } | undefined) {
    const tenantId = this.requireTenant(user);

    const [employees, leaves, payrollRuns] = await Promise.all([
      this.prisma.employee.count({ where: { tenantId } }),
      this.prisma.leaveRequest.count({ where: { employee: { tenantId } } }),
      this.prisma.payrollRun.count({ where: { tenantId } }),
    ]);

    return { employees, leaves, payrollRuns };
  }

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

  async platformTenantUsers(tenantId: number) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, companyCode: true, plan: true },
    });

    if (!tenant) {
      throw new ForbiddenException('Tenant not found.');
    }

    const users = await this.prisma.user.findMany({
      where: { tenantId },
      orderBy: [{ status: 'asc' }, { firstName: 'asc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        createdAt: true,
        roles: {
          select: {
            role: {
              select: { name: true },
            },
          },
        },
      },
    });

    return {
      tenant,
      users: users.map((user) => ({
        id: user.id,
        name: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email,
        email: user.email,
        status: user.status,
        roles: user.roles.map((entry) => entry.role.name),
        createdAt: user.createdAt,
      })),
    };
  }
}
