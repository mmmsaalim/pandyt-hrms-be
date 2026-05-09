import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { InviteEmployeeDto } from './dto/invite-employee.dto';
import { InvitationsService } from '../invitations/invitations.service';

type RequestUser = { sub: string; roles?: string[] } | undefined;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitationsService: InvitationsService,
  ) {}

  private hasRole(user: RequestUser, role: string): boolean {
    return (user?.roles ?? []).includes(role);
  }

  private async getEmployeeContext(userId: string) {
    return this.prisma.employee.findUnique({
      where: { userId },
      select: { id: true, tenantId: true },
    });
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
      where: { tenantId: adminContext.tenantId },
      include: { user: true, tenant: true },
      orderBy: { joinedDate: 'desc' },
    });
  }

  async findOne(id: string, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: { user: true, tenant: true },
    });

    if (!employee) {
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

  private buildEmployeeCode(name: string): string {
    const seed = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'EMP';
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `${seed}-${suffix}`;
  }

  async inviteEmployee(dto: InviteEmployeeDto, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const adminContext = await this.getEmployeeContext(user.sub);
    if (!adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    const requestedRole = dto.role === 'COMPANY_ADMIN' ? 'COMPANY_ADMIN' : 'EMPLOYEE';

    const role = await this.prisma.role.findUnique({
      where: { name: requestedRole },
      select: { id: true },
    });

    if (!role) {
      throw new NotFoundException(`${requestedRole} role is not configured.`);
    }

    const [firstName, ...lastNameParts] = dto.name.trim().split(/\s+/);
    const lastName = lastNameParts.join(' ') || 'User';
    const placeholderPasswordHash = await bcrypt.hash(randomBytes(48).toString('hex'), 10);
    const employeeCode = dto.employeeCode?.trim() || this.buildEmployeeCode(dto.name);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: adminContext.tenantId },
      select: { name: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found for company admin.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email: dto.workEmail,
          passwordHash: placeholderPasswordHash,
          firstName: firstName || 'Employee',
          lastName,
          status: 'PENDING',
          tenantId: adminContext.tenantId,
        },
      });

      await tx.userRole.create({
        data: {
          userId: createdUser.id,
          roleId: role.id,
        },
      });

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
    };
  }

  async update(id: string, dto: UpdateEmployeeDto, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const [adminContext, targetEmployee] = await Promise.all([
      this.getEmployeeContext(user.sub),
      this.prisma.employee.findUnique({ where: { id }, select: { tenantId: true } }),
    ]);

    if (!adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    if (!targetEmployee || targetEmployee.tenantId !== adminContext.tenantId) {
      throw new ForbiddenException('Cannot update employee from another tenant.');
    }

    const data = dto.joinedDate
      ? { ...dto, joinedDate: new Date(dto.joinedDate) }
      : dto;

    return this.prisma.employee.update({ where: { id }, data });
  }

  async remove(id: string, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const [adminContext, targetEmployee] = await Promise.all([
      this.getEmployeeContext(user.sub),
      this.prisma.employee.findUnique({ where: { id }, select: { tenantId: true } }),
    ]);

    if (!adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    if (!targetEmployee || targetEmployee.tenantId !== adminContext.tenantId) {
      throw new ForbiddenException('Cannot remove employee from another tenant.');
    }

    return this.prisma.employee.delete({ where: { id } });
  }
}
