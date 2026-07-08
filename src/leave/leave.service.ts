import { ForbiddenException, Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';
import {
  LeaveSetupConfig,
  resolveLeavePolicies,
  SRI_LANKA_LEAVE_POLICIES,
  SRI_LANKA_LEAVE_PRESET_KEY,
} from './leave.constants';

export type { LeaveSetupConfig } from './leave.constants';

type RequestUser = { sub: number; roles?: string[]; effectivePermissions?: string[] } | undefined;

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

  private hasRole(user: RequestUser, role: string): boolean {
    return (user?.roles ?? []).includes(role);
  }

  private hasPermission(user: RequestUser, permission: string): boolean {
    return (user?.effectivePermissions ?? []).includes(permission);
  }

  private isLeavePeriodEnded(endDate: Date): boolean {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const leaveEnd = new Date(endDate);
    leaveEnd.setHours(0, 0, 0, 0);
    return leaveEnd < today;
  }

  private parseLeaveDateOnly(value: string): Date {
    const iso = value.trim().split('T')[0];
    const [year, month, day] = iso.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private tomorrowStart(): Date {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + 1);
    return date;
  }

  private validateLeaveDates(
    startDate: string,
    endDate: string,
    days: number,
    options: { allowPastDates: boolean },
  ): number {
    const start = this.parseLeaveDateOnly(startDate);
    const end = this.parseLeaveDateOnly(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);

    if (end < start) {
      throw new BadRequestException('End date cannot be before start date.');
    }

    if (!options.allowPastDates && start < this.tomorrowStart()) {
      throw new BadRequestException('Leave can only be requested from tomorrow onwards.');
    }

    const calculatedDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (days !== calculatedDays) {
      throw new BadRequestException(
        `Leave days (${days}) must match the selected date range (${calculatedDays} day(s)).`,
      );
    }

    return calculatedDays;
  }

  private canBackdateLeave(user: RequestUser, status?: string): boolean {
    const isManualStatus = status === 'APPROVED' || status === 'REJECTED';
    const isManager =
      this.hasRole(user, 'COMPANY_ADMIN') ||
      this.hasRole(user, 'HR_MANAGER') ||
      (this.hasRole(user, 'TEAM_LEAD') && this.hasPermission(user, 'leave.manage'));
    return isManualStatus && isManager;
  }

  private async getEmployeeContext(userId: number) {
    return this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true, tenantId: true },
    });
  }

  async findAll(user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const employeeContext = await this.getEmployeeContext(user.sub);
    if (!employeeContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    if (this.hasRole(user, 'COMPANY_ADMIN') || this.hasRole(user, 'HR_MANAGER')) {
      return this.prisma.leaveRequest.findMany({
        where: { employee: { tenantId: employeeContext.tenantId } },
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { include: { user: true } },
          approvedBy: { include: { user: true } },
        },
      });
    }

    if (this.hasRole(user, 'TEAM_LEAD')) {
      const canManageAll = this.hasPermission(user, 'leave.manage');
      return this.prisma.leaveRequest.findMany({
        where: canManageAll
          ? { employee: { tenantId: employeeContext.tenantId } }
          : {
              employee: {
                tenantId: employeeContext.tenantId,
                managerId: employeeContext.id,
              },
            },
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { include: { user: true } },
          approvedBy: { include: { user: true } },
        },
      });
    }

    if (this.hasRole(user, 'EMPLOYEE')) {
      return this.prisma.leaveRequest.findMany({
        where: { employeeId: employeeContext.id },
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { include: { user: true } },
          approvedBy: { include: { user: true } },
        },
      });
    }

    throw new ForbiddenException('Insufficient role permission.');
  }

  async create(dto: CreateLeaveRequestDto, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const requesterContext = await this.getEmployeeContext(user.sub);
    if (!requesterContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    let employeeId = dto.employeeId ?? requesterContext.id;

    if (this.hasRole(user, 'EMPLOYEE')) {
      employeeId = requesterContext.id;
    }

    if (this.hasRole(user, 'COMPANY_ADMIN') || this.hasRole(user, 'HR_MANAGER') || this.hasRole(user, 'TEAM_LEAD')) {
      const targetEmployee = await this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: { tenantId: true, managerId: true },
      });

      if (!targetEmployee || targetEmployee.tenantId !== requesterContext.tenantId) {
        throw new ForbiddenException('Cannot create leave for another tenant.');
      }

      if (
        this.hasRole(user, 'TEAM_LEAD') &&
        !this.hasPermission(user, 'leave.manage') &&
        targetEmployee.managerId !== requesterContext.id
      ) {
        throw new ForbiddenException('Team lead can only create leave for direct reports.');
      }
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { tenantId: true },
    });
    if (!employee) throw new ForbiddenException('Employee not found.');

    let policy = await this.prisma.leavePolicy.findFirst({
      where: { tenantId: employee.tenantId, name: { equals: dto.type, mode: 'insensitive' } },
    });

    if (!policy) {
      policy = await this.prisma.leavePolicy.create({
        data: {
          tenantId: employee.tenantId,
          name: dto.type,
          days: 14,
          accrualRate: 14 / 12,
        },
      });
    }

    const balances = await this.getBalances(employeeId, user);
    const balance = balances.find((b) => b.leavePolicyId === policy!.id);

    if (balance) {
      const available = balance.allocated - balance.used;
      if (available < dto.days) {
        throw new ForbiddenException(`Insufficient leave balance. Requested ${dto.days} but only ${available} available.`);
      }
    }

    const allowPastDates = this.canBackdateLeave(user, dto.status);
    this.validateLeaveDates(dto.startDate, dto.endDate, dto.days, { allowPastDates });

    let approvedById: number | null = null;
    if (dto.status === 'APPROVED' || dto.status === 'REJECTED') {
      approvedById = requesterContext.id;
    }

    return this.prisma.leaveRequest.create({
      data: {
        employeeId,
        type: dto.type,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        days: dto.days,
        reason: dto.reason,
        status: dto.status ?? 'PENDING',
        approvedById,
      },
    });
  }

  async update(id: number, dto: UpdateLeaveRequestDto, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const adminEmployeeContext = await this.getEmployeeContext(user.sub);
    if (!adminEmployeeContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    const leaveRequest = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: {
        employee: {
          select: { id: true, tenantId: true, managerId: true },
        },
      },
    });

    if (
      !leaveRequest ||
      leaveRequest.employee.tenantId !== adminEmployeeContext.tenantId
    ) {
      throw new ForbiddenException('Cannot update leave for another tenant.');
    }

    const originalStatus = leaveRequest.status;
    const newStatus = dto.status;

    if (newStatus === 'APPROVED' || newStatus === 'REJECTED') {
      if (!this.hasPermission(user, 'leave.manage')) {
        throw new ForbiddenException('leave.manage permission is required to approve or reject leave.');
      }

      if (originalStatus === 'PENDING' && this.isLeavePeriodEnded(leaveRequest.endDate)) {
        throw new BadRequestException(
          'Cannot approve or reject leave after the leave period has ended.',
        );
      }

      if (newStatus === 'REJECTED' && !dto.rejectionReason?.trim()) {
        throw new BadRequestException('Rejection reason is required when rejecting leave.');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updateData: {
        status?: typeof newStatus;
        approvedById?: number | null;
        approvalComment?: string | null;
        rejectionReason?: string | null;
      } = {};

      if (newStatus) {
        updateData.status = newStatus;
      }

      if (newStatus === 'APPROVED') {
        updateData.approvedById = adminEmployeeContext.id;
        updateData.approvalComment = dto.approvalComment?.trim() || null;
        updateData.rejectionReason = null;
      } else if (newStatus === 'REJECTED') {
        updateData.approvedById = adminEmployeeContext.id;
        updateData.rejectionReason = dto.rejectionReason!.trim();
        updateData.approvalComment = null;
      } else if (newStatus === 'PENDING') {
        updateData.approvedById = null;
        updateData.approvalComment = null;
        updateData.rejectionReason = null;
      }

      const updated = await tx.leaveRequest.update({
        where: { id },
        data: updateData,
        include: {
          employee: { include: { user: true } },
          approvedBy: { include: { user: true } },
        },
      });

      if (originalStatus !== 'APPROVED' && newStatus === 'APPROVED') {
        const policy = await tx.leavePolicy.findFirst({
          where: { tenantId: leaveRequest.employee.tenantId, name: { equals: leaveRequest.type, mode: 'insensitive' } },
        });

        if (policy) {
          const balance = await tx.leaveBalance.findUnique({
            where: {
              employeeId_leavePolicyId: {
                employeeId: leaveRequest.employeeId,
                leavePolicyId: policy.id,
              },
            },
          });

          if (balance) {
            await tx.leaveBalance.update({
              where: { id: balance.id },
              data: { used: { increment: leaveRequest.days } },
            });
          }
        }
      } else if (originalStatus === 'APPROVED' && newStatus !== 'APPROVED') {
        const policy = await tx.leavePolicy.findFirst({
          where: { tenantId: leaveRequest.employee.tenantId, name: { equals: leaveRequest.type, mode: 'insensitive' } },
        });

        if (policy) {
          const balance = await tx.leaveBalance.findUnique({
            where: {
              employeeId_leavePolicyId: {
                employeeId: leaveRequest.employeeId,
                leavePolicyId: policy.id,
              },
            },
          });

          if (balance) {
            await tx.leaveBalance.update({
              where: { id: balance.id },
              data: { used: { decrement: leaveRequest.days } },
            });
          }
        }
      }

      return updated;
    });
  }

  async remove(id: number, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const actorContext = await this.getEmployeeContext(user.sub);
    if (!actorContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    const leaveRequest = await this.prisma.leaveRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        employee: {
          select: { id: true, tenantId: true, userId: true },
        },
      },
    });

    if (!leaveRequest || leaveRequest.employee.tenantId !== actorContext.tenantId) {
      throw new ForbiddenException('Cannot remove leave for another tenant.');
    }

    const isOwner = leaveRequest.employee.userId === user.sub;

    if (leaveRequest.status !== 'PENDING') {
      throw new BadRequestException('Only pending leave requests can be withdrawn.');
    }

    if (!isOwner) {
      throw new ForbiddenException('You can only withdraw your own pending leave requests.');
    }

    return this.prisma.leaveRequest.delete({ where: { id } });
  }

  // --- Leave Policies CRUD ---
  async findAllPolicies(user: RequestUser) {
    const context = await this.getEmployeeContext(user!.sub);
    if (!context) throw new ForbiddenException('Employee profile not found.');

    await this.ensureDefaultLeavePolicies(context.tenantId);

    return this.prisma.leavePolicy.findMany({
      where: { tenantId: context.tenantId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  getLeavePresets() {
    return {
      presetKey: SRI_LANKA_LEAVE_PRESET_KEY,
      policies: SRI_LANKA_LEAVE_POLICIES,
    };
  }

  async seedPoliciesForTenant(
    tenantId: number,
    setup?: LeaveSetupConfig | null,
    options?: { onlyIfEmpty?: boolean },
  ) {
    if (options?.onlyIfEmpty) {
      const existingCount = await this.prisma.leavePolicy.count({ where: { tenantId } });
      if (existingCount > 0) {
        return { seeded: false, reason: 'already_configured' as const };
      }
    }

    const policies = resolveLeavePolicies(setup);

    for (const policy of policies) {
      await this.prisma.leavePolicy.upsert({
        where: {
          tenantId_code: {
            tenantId,
            code: policy.code,
          },
        },
        update: {
          name: policy.name,
          days: policy.days,
          carryForwardLimit: policy.carryForwardLimit,
          accrualRate: policy.accrualRate,
          sortOrder: policy.sortOrder,
          description: policy.description ?? null,
          genderScope: policy.genderScope ?? 'ALL',
          isActive: true,
        },
        create: {
          tenantId,
          code: policy.code,
          name: policy.name,
          days: policy.days,
          carryForwardLimit: policy.carryForwardLimit,
          accrualRate: policy.accrualRate,
          sortOrder: policy.sortOrder,
          description: policy.description ?? null,
          genderScope: policy.genderScope ?? 'ALL',
          isActive: true,
        },
      });
    }

    return { seeded: true, count: policies.length };
  }

  async syncPoliciesFromTenantConfig(tenantId: number) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { config: true },
    });

    if (!tenant) {
      return { seeded: false, reason: 'tenant_not_found' as const };
    }

    const config = (tenant.config ?? {}) as Record<string, unknown>;
    const leaveSetup = config.leaveSetup as LeaveSetupConfig | undefined;

    return this.seedPoliciesForTenant(tenantId, leaveSetup, { onlyIfEmpty: false });
  }

  async createPolicy(dto: { name: string; days: number; carryForwardLimit?: number; accrualRate?: number }, user: RequestUser) {
    const context = await this.getEmployeeContext(user!.sub);
    if (!context) throw new ForbiddenException('Employee profile not found.');

    return this.prisma.leavePolicy.create({
      data: {
        ...dto,
        tenantId: context.tenantId,
      },
    });
  }

  private async ensureDefaultLeavePolicies(tenantId: number) {
    await this.seedPoliciesForTenant(tenantId, null, { onlyIfEmpty: true });
  }

  // --- Leave Balances ---
  async getBalances(employeeId?: number, user?: RequestUser) {
    const context = await this.getEmployeeContext(user!.sub);
    if (!context) throw new ForbiddenException('Employee profile not found.');

    await this.ensureDefaultLeavePolicies(context.tenantId);

    let targetEmployeeId = employeeId;
    if (this.hasRole(user, 'EMPLOYEE')) {
      targetEmployeeId = context.id;
    } else if (!targetEmployeeId) {
      targetEmployeeId = context.id;
    } else {
      const targetEmpCtx = await this.prisma.employee.findUnique({
        where: { id: targetEmployeeId },
        select: { tenantId: true },
      });
      if (!targetEmpCtx || targetEmpCtx.tenantId !== context.tenantId) {
        throw new ForbiddenException('Target employee is outside your tenant.');
      }
    }

    const policies = await this.prisma.leavePolicy.findMany({
      where: { tenantId: context.tenantId },
    });

    const existingBalances = await this.prisma.leaveBalance.findMany({
      where: { employeeId: targetEmployeeId },
    });

    const existingPolicyIds = new Set(existingBalances.map((b) => b.leavePolicyId));
    const missingPolicies = policies.filter((p) => !existingPolicyIds.has(p.id));

    if (missingPolicies.length > 0) {
      await this.prisma.leaveBalance.createMany({
        data: missingPolicies.map((p) => ({
          tenantId: context.tenantId,
          employeeId: targetEmployeeId!,
          leavePolicyId: p.id,
          allocated: p.days,
          used: 0,
          accrued: 0,
        })),
      });
    }

    return this.prisma.leaveBalance.findMany({
      where: { employeeId: targetEmployeeId },
      include: { leavePolicy: true },
    });
  }

  // --- Accrual Engine ---
  async runAccrual(user: RequestUser) {
    const context = await this.getEmployeeContext(user!.sub);
    if (!context) throw new ForbiddenException('Employee profile not found.');

    const employees = await this.prisma.employee.findMany({
      where: { tenantId: context.tenantId, deletedAt: null },
    });

    const policies = await this.prisma.leavePolicy.findMany({
      where: { tenantId: context.tenantId },
    });

    for (const emp of employees) {
      for (const policy of policies) {
        const balance = await this.prisma.leaveBalance.findUnique({
          where: {
            employeeId_leavePolicyId: {
              employeeId: emp.id,
              leavePolicyId: policy.id,
            },
          },
        });

        const accrualAmount = policy.accrualRate || (policy.days / 12);

        if (balance) {
          await this.prisma.leaveBalance.update({
            where: { id: balance.id },
            data: {
              accrued: { increment: accrualAmount },
              allocated: { increment: accrualAmount },
            },
          });
        } else {
          await this.prisma.leaveBalance.create({
            data: {
              tenantId: context.tenantId,
              employeeId: emp.id,
              leavePolicyId: policy.id,
              allocated: policy.days + accrualAmount,
              used: 0,
              accrued: accrualAmount,
            },
          });
        }
      }
    }

    return { success: true, processedEmployeesCount: employees.length };
  }
}
