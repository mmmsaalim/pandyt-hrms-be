import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Leave Accrual Engine
 * Runs on 1st of each month to accrue leave entitlements
 */
@Injectable()
export class LeaveAccrualService {
  private readonly logger = new Logger(LeaveAccrualService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Run monthly accrual (first day of month at 00:05 UTC)
   */
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async runMonthlyAccrual() {
    this.logger.log('Starting monthly leave accrual process...');

    try {
      const tenants = await this.prisma.tenant.findMany();
      let totalAccrued = 0;

      for (const tenant of tenants) {
        const accrued = await this.accrueForTenant(tenant.id);
        totalAccrued += accrued;
      }

      this.logger.log(`Monthly accrual complete. ${totalAccrued} balances updated.`);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Accrual failed: ${errMsg}`, error);
    }
  }

  /**
   * Accrue leave for all active employees in a tenant
   */
  async accrueForTenant(tenantId: number): Promise<number> {
    // Get all leave policies for tenant
    const policies = await this.prisma.leavePolicy.findMany({
      where: { tenantId },
    });

    // Get all active employees for tenant
    const employees = await this.prisma.employee.findMany({
      where: { tenantId, employmentStatus: 'ACTIVE' },
    });

    let balancesUpdated = 0;

    for (const policy of policies) {
      for (const employee of employees) {
        // Calculate accrual amount based on policy's accrual rate (per month)
        const monthlyAccrual = policy.accrualRate || policy.days / 12;

        // Check if balance record exists
        const balance = await this.prisma.leaveBalance.findUnique({
          where: {
            employeeId_leavePolicyId: {
              employeeId: employee.id,
              leavePolicyId: policy.id,
            },
          },
        });

        if (balance) {
          // Update existing balance: add accrual, apply carry-forward limits
          const newAccrued = balance.accrued + monthlyAccrual;
          const totalAllocated = balance.allocated + monthlyAccrual;

          // Apply carry-forward limit: cannot exceed allocated + carry-forward-limit
          const maxAllowed = balance.allocated + (policy.carryForwardLimit || 0);
          const cappedAllocated = Math.min(totalAllocated, maxAllowed);

          await this.prisma.leaveBalance.update({
            where: { id: balance.id },
            data: {
              allocated: cappedAllocated,
              accrued: newAccrued,
            },
          });

          balancesUpdated++;
        } else {
          // Create new balance record with initial accrual
          await this.prisma.leaveBalance.create({
            data: {
              tenantId,
              employeeId: employee.id,
              leavePolicyId: policy.id,
              allocated: monthlyAccrual,
              used: 0,
              accrued: monthlyAccrual,
            },
          });

          balancesUpdated++;
        }
      }
    }

    return balancesUpdated;
  }

  /**
   * Manual trigger for accrual (for testing or admin override)
   */
  async accrueManual(tenantId: number): Promise<{ message: string; updated: number }> {
    const updated = await this.accrueForTenant(tenantId);
    return { message: `Accrual complete for tenant ${tenantId}`, updated };
  }
}
