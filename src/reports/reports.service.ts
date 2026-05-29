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
}
