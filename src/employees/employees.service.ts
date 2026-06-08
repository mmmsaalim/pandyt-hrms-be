import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { InviteEmployeeDto } from './dto/invite-employee.dto';
import { InvitationsService } from '../invitations/invitations.service';

type RequestUser = { sub: number; roles?: string[] } | undefined;
type TxClient = Prisma.TransactionClient;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitationsService: InvitationsService,
  ) {}

  private hasRole(user: RequestUser, role: string): boolean {
    return (user?.roles ?? []).includes(role);
  }

  private async getEmployeeContext(userId: number) {
    return this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true, tenantId: true },
    });
  }

  private async ensureModuleAccess(
    tx: TxClient,
    tenantId: number,
    userId: number,
    modules: string[],
  ) {
    const permissions = await tx.permission.findMany({
      where: { module: { in: modules } },
      orderBy: [{ module: 'asc' }, { permission: 'asc' }],
    });

    const grouped = new Map<string, number[]>();
    for (const permission of permissions) {
      grouped.set(permission.module, [...(grouped.get(permission.module) ?? []), permission.id]);
    }

    for (const [module, permissionIds] of grouped.entries()) {
      const roleName = module.toUpperCase();
      const existingRole = await tx.role.findFirst({
        where: { tenantId, name: roleName },
        select: { id: true },
      });

      const role =
        existingRole ??
        (await tx.role.create({
          data: {
            tenantId,
            name: roleName,
            description: `${module} module access role`,
          },
          select: { id: true },
        }));

      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permissionIds.length > 0) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
          })),
        });
      }

      await tx.userRole.upsert({
        where: {
          userId_roleId: {
            userId,
            roleId: role.id,
          },
        },
        update: {},
        create: {
          userId,
          roleId: role.id,
        },
      });
    }
  }

  async findAll(user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const adminContext = await this.getEmployeeContext(user.sub);
    if (!adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    return this.prisma.employee.findMany({
      where: { tenantId: adminContext.tenantId, deletedAt: null },
      include: {
        user: {
          include: {
            roles: {
              include: {
                role: {
                  select: { name: true },
                },
              },
            },
          },
        },
        tenant: true,
      },
      orderBy: { joinedDate: 'desc' },
    });
  }

  async findOne(id: number, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { user: true, tenant: true },
    });

    if (!employee || employee.deletedAt !== null) {
      throw new NotFoundException('Employee not found.');
    }

    if (this.hasRole(user, 'EMPLOYEE')) {
      const ownContext = await this.getEmployeeContext(user.sub);
      if (!ownContext || ownContext.id !== employee.id) {
        throw new ForbiddenException('Cannot access another employee profile.');
      }

      return employee;
    }

    const adminContext = await this.getEmployeeContext(user.sub);
    if (!adminContext || adminContext.tenantId !== employee.tenantId) {
      throw new ForbiddenException('Cannot access employee from another tenant.');
    }

    return employee;
  }

  async create(dto: CreateEmployeeDto, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const adminContext = await this.getEmployeeContext(user.sub);
    if (!adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    if (dto.tenantId !== adminContext.tenantId) {
      throw new ForbiddenException('Cannot create employee for another tenant.');
    }

    return this.prisma.employee.create({
      data: {
        ...dto,
        joinedDate: new Date(dto.joinedDate),
      },
    });
  }

  private buildEmployeeCode(name: string, tenantId: number): string {
    const seed = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'EMP';
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `TEN${tenantId}-${seed}-${suffix}`;
  }

  private async resolveEmployeeCode(
    tx: TxClient,
    tenantId: number,
    name: string,
    requestedCode?: string,
  ): Promise<string> {
    const manualCode = requestedCode?.trim();
    if (manualCode) {
      const existing = await tx.employee.findUnique({
        where: { employeeCode: manualCode },
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException('Employee code already exists. Please use a different code.');
      }

      return manualCode;
    }

    for (let attempts = 0; attempts < 10; attempts += 1) {
      const generated = this.buildEmployeeCode(name, tenantId);
      const existing = await tx.employee.findUnique({
        where: { employeeCode: generated },
        select: { id: true },
      });

      if (!existing) {
        return generated;
      }
    }

    throw new ConflictException('Failed to generate a unique employee code. Please retry.');
  }

  async inviteEmployee(dto: InviteEmployeeDto, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const adminContext = await this.getEmployeeContext(user.sub);
    if (!adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    const isCompanyAdmin = this.hasRole(user, 'COMPANY_ADMIN');
    const isHRManager = this.hasRole(user, 'HR_MANAGER');

    if (!isCompanyAdmin && !isHRManager) {
      throw new ForbiddenException('Only COMPANY_ADMIN or HR_MANAGER can invite users.');
    }

    // HR manager is restricted to operational roles inside tenant.
    if (isHRManager) {
      const restrictedRoles = ['HR_MANAGER', 'TEAM_LEAD', 'EMPLOYEE'];
      if (!restrictedRoles.includes(dto.role)) {
        throw new ForbiddenException('HR_MANAGER can only create HR_MANAGER, TEAM_LEAD, or EMPLOYEE roles.');
      }
    }

    if (isHRManager && dto.role === 'COMPANY_ADMIN') {
      throw new ForbiddenException('Only COMPANY_ADMIN can create COMPANY_ADMIN role.');
    }

    // Validate requested role
    const validRoles = ['EMPLOYEE', 'HR_MANAGER', 'TEAM_LEAD', 'COMPANY_ADMIN'];
    if (!validRoles.includes(dto.role)) {
      throw new ForbiddenException(`Invalid role: ${dto.role}`);
    }

    const normalizedEmail = dto.workEmail.trim().toLowerCase();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('A user with this work email address already exists.');
    }

    const requestedRole = dto.role;

    const role = await this.prisma.role.findFirst({
      where: {
        name: requestedRole,
        tenantId: null,
      },
      select: { id: true },
    });

    if (!role) {
      throw new NotFoundException(`${requestedRole} role is not configured.`);
    }

    const [firstName, ...lastNameParts] = dto.name.trim().split(/\s+/);
    const lastName = lastNameParts.join(' ') || 'User';
    const temporaryPassword = 'admin@123';
    const temporaryPasswordHash = await bcrypt.hash(temporaryPassword, 10);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: adminContext.tenantId },
      select: { name: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found for company admin.');
    }

    // Define module access per role
    const moduleAccessMap: Record<string, string[]> = {
      EMPLOYEE: ['attendance', 'leave', 'payslips', 'reports'],
      TEAM_LEAD: ['attendance', 'leave', 'reports'],
      HR_MANAGER: ['employees', 'leave', 'attendance', 'payroll', 'payslips', 'reports', 'configuration'],
      COMPANY_ADMIN: ['employees', 'leave', 'attendance', 'payroll', 'payslips', 'reports', 'configuration'],
    };

    const modulesForRole = moduleAccessMap[requestedRole] || moduleAccessMap.EMPLOYEE;

    const result = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash: temporaryPasswordHash,
          firstName: firstName || 'Employee',
          lastName,
          status: 'ACTIVE',
          tenantId: adminContext.tenantId,
        },
      });

      await tx.userRole.create({
        data: {
          userId: createdUser.id,
          roleId: role.id,
        },
      });

      // Assign module-based access for the role
      await this.ensureModuleAccess(tx, adminContext.tenantId, createdUser.id, modulesForRole);

      const employeeCode = await this.resolveEmployeeCode(
        tx,
        adminContext.tenantId,
        dto.name,
        dto.employeeCode,
      );

      const employee = await tx.employee.create({
        data: {
          tenantId: adminContext.tenantId,
          userId: createdUser.id,
          employeeCode,
          department: dto.department,
          designation: dto.designation,
          joinedDate: new Date(),
          employmentStatus: 'ACTIVE',
        },
        include: { user: true, tenant: true },
      });

      return { createdUser, employee };
    });

    const invitation = await this.invitationsService.createAndSendInvitation({
      tenantId: adminContext.tenantId,
      userId: result.createdUser.id,
      email: result.createdUser.email,
      role: requestedRole,
      fullName: dto.name,
      companyName: tenant.name,
    });

    return {
      employee: result.employee,
      invitation,
      temporaryPassword,
    };
  }

  async update(id: number, dto: UpdateEmployeeDto, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const [adminContext, targetEmployee] = await Promise.all([
      this.getEmployeeContext(user.sub),
      this.prisma.employee.findUnique({ where: { id }, select: { tenantId: true, deletedAt: true } }),
    ]);

    if (!adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    if (!targetEmployee || targetEmployee.deletedAt !== null) {
      throw new NotFoundException('Employee not found.');
    }

    if (targetEmployee.tenantId !== adminContext.tenantId) {
      throw new ForbiddenException('Cannot update employee from another tenant.');
    }

    const data = dto.joinedDate
      ? { ...dto, joinedDate: new Date(dto.joinedDate) }
      : dto;

    return this.prisma.employee.update({ where: { id }, data });
  }

  async remove(id: number, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const isSuperAdmin = this.hasRole(user, 'SUPER_ADMIN');
    const [adminContext, targetEmployee] = await Promise.all([
      isSuperAdmin ? Promise.resolve(null) : this.getEmployeeContext(user.sub),
      this.prisma.employee.findUnique({
        where: { id },
        select: {
          tenantId: true,
          userId: true,
          deletedAt: true,
          user: {
            select: {
              roles: {
                include: {
                  role: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    if (!isSuperAdmin && !adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    if (!targetEmployee || targetEmployee.deletedAt !== null) {
      throw new NotFoundException('Employee not found.');
    }

    if (!isSuperAdmin && targetEmployee.tenantId !== adminContext!.tenantId) {
      throw new ForbiddenException('Cannot remove employee from another tenant.');
    }

    const targetRoles = (targetEmployee.user?.roles ?? []).map((entry) => entry.role.name);
    const targetIsCompanyAdmin = targetRoles.includes('COMPANY_ADMIN');

    if (!isSuperAdmin && targetIsCompanyAdmin) {
      throw new ForbiddenException('Only SUPER_ADMIN can remove a COMPANY_ADMIN user.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedEmp = await tx.employee.update({
        where: { id },
        data: { deletedAt: new Date() },
      });

      await tx.user.update({
        where: { id: targetEmployee.userId },
        data: { status: 'INACTIVE' },
      });

      return updatedEmp;
    });
  }

  async anonymize(id: number, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const [adminContext, targetEmployee] = await Promise.all([
      this.getEmployeeContext(user.sub),
      this.prisma.employee.findUnique({ where: { id }, include: { user: true } }),
    ]);

    if (!adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    if (!targetEmployee || targetEmployee.deletedAt !== null) {
      throw new NotFoundException('Employee not found.');
    }

    if (targetEmployee.tenantId !== adminContext.tenantId) {
      throw new ForbiddenException('Cannot anonymize employee from another tenant.');
    }

    return this.prisma.$transaction(async (tx) => {
      const updatedEmp = await tx.employee.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          employmentStatus: 'INACTIVE',
        },
      });

      await tx.user.update({
        where: { id: targetEmployee.userId },
        data: {
          firstName: 'Anonymized',
          lastName: 'User',
          email: `deleted_${id}@null.com`,
          passwordHash: await bcrypt.hash(randomBytes(12).toString('hex'), 10),
          status: 'INACTIVE',
        },
      });

      return updatedEmp;
    });
  }

  async exportData(id: number, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            createdAt: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            companyCode: true,
          },
        },
        leaveRequests: true,
        attendance: true,
        payslips: true,
      },
    });

    if (!employee || employee.deletedAt !== null) {
      throw new NotFoundException('Employee not found.');
    }

    if (this.hasRole(user, 'EMPLOYEE')) {
      const ownContext = await this.getEmployeeContext(user.sub);
      if (!ownContext || ownContext.id !== employee.id) {
        throw new ForbiddenException('Cannot export another employee profile.');
      }
    } else {
      const adminContext = await this.getEmployeeContext(user.sub);
      if (!adminContext || adminContext.tenantId !== employee.tenantId) {
        throw new ForbiddenException('Cannot export employee from another tenant.');
      }
    }

    return employee;
  }
}
