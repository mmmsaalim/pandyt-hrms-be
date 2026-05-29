import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';

type RequestUser = { sub: number; roles?: string[] } | undefined;

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

  private hasRole(user: RequestUser, role: string): boolean {
    return (user?.roles ?? []).includes(role);
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

    if (this.hasRole(user, 'EMPLOYEE')) {
      return this.prisma.leaveRequest.findMany({
        where: { employeeId: employeeContext.id },
        orderBy: { createdAt: 'desc' },
        include: { employee: { include: { user: true } } },
      });
    }

    if (this.hasRole(user, 'COMPANY_ADMIN')) {
      return this.prisma.leaveRequest.findMany({
        where: { employee: { tenantId: employeeContext.tenantId } },
        orderBy: { createdAt: 'desc' },
        include: { employee: { include: { user: true } } },
      });
    }

    // HR_MANAGER: can see leave requests for their department/tenant
    if (this.hasRole(user, 'HR_MANAGER')) {
      return this.prisma.leaveRequest.findMany({
        where: { employee: { tenantId: employeeContext.tenantId } },
        orderBy: { createdAt: 'desc' },
        include: { employee: { include: { user: true } } },
      });
    }

    // TEAM_LEAD: can see leave requests only from direct reports (team members)
    if (this.hasRole(user, 'TEAM_LEAD')) {
      return this.prisma.leaveRequest.findMany({
        where: {
          employee: {
            tenantId: employeeContext.tenantId,
            managerId: employeeContext.id,
          },
        },
        orderBy: { createdAt: 'desc' },
        include: { employee: { include: { user: true } } },
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

    if (this.hasRole(user, 'COMPANY_ADMIN')) {
      const targetEmployee = await this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: { tenantId: true },
      });

      if (!targetEmployee || targetEmployee.tenantId !== requesterContext.tenantId) {
        throw new ForbiddenException('Cannot create leave for another tenant.');
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

    return this.prisma.leaveRequest.create({
      data: {
        employeeId,
        type: dto.type,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        days: dto.days,
        reason: dto.reason,
        status: dto.status ?? 'PENDING',
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

    // Authorization check for managers
    if (this.hasRole(user, 'TEAM_LEAD')) {
      // Team lead can only approve leave for their direct reports
      if (leaveRequest.employee.managerId !== adminEmployeeContext.id) {
        throw new ForbiddenException('Team lead can only approve leave for direct reports.');
      }
    }

    if (this.hasRole(user, 'HR_MANAGER')) {
      // HR Manager authorization is at tenant level, already checked above
      // They can approve leave for anyone in their tenant
    }

    const originalStatus = leaveRequest.status;
    const newStatus = dto.status;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.leaveRequest.update({ where: { id }, data: dto });

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

    const adminEmployeeContext = await this.getEmployeeContext(user.sub);
    if (!adminEmployeeContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    const leaveRequest = await this.prisma.leaveRequest.findUnique({
      where: { id },
      select: {
        employee: {
          select: { tenantId: true },
        },
      },
    });

    if (
      !leaveRequest ||
      leaveRequest.employee.tenantId !== adminEmployeeContext.tenantId
    ) {
      throw new ForbiddenException('Cannot remove leave for another tenant.');
    }

    return this.prisma.leaveRequest.delete({ where: { id } });
  }

  // --- Leave Policies CRUD ---
  async findAllPolicies(user: RequestUser) {
    const context = await this.getEmployeeContext(user!.sub);
    if (!context) throw new ForbiddenException('Employee profile not found.');

    return this.prisma.leavePolicy.findMany({
      where: { tenantId: context.tenantId },
    });
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

  // --- Leave Balances ---
  async getBalances(employeeId?: number, user?: RequestUser) {
    const context = await this.getEmployeeContext(user!.sub);
    if (!context) throw new ForbiddenException('Employee profile not found.');

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
