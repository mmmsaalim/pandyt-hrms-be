import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';

type RequestUser = { sub: string; roles?: string[] } | undefined;

@Injectable()
export class LeaveService {
  constructor(private readonly prisma: PrismaService) {}

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

    throw new ForbiddenException('Insufficient role permission.');
  }

  async create(dto: CreateLeaveRequestDto, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    let employeeId = dto.employeeId;

    if (this.hasRole(user, 'EMPLOYEE')) {
      const employeeContext = await this.getEmployeeContext(user.sub);
      if (!employeeContext) {
        throw new ForbiddenException('Employee profile not found for this user.');
      }

      employeeId = employeeContext.id;
    }

    if (this.hasRole(user, 'COMPANY_ADMIN')) {
      const [adminEmployeeContext, targetEmployee] = await Promise.all([
        this.getEmployeeContext(user.sub),
        this.prisma.employee.findUnique({
          where: { id: employeeId },
          select: { tenantId: true },
        }),
      ]);

      if (!adminEmployeeContext) {
        throw new ForbiddenException('Employee profile not found for this user.');
      }

      if (!targetEmployee || targetEmployee.tenantId !== adminEmployeeContext.tenantId) {
        throw new ForbiddenException('Cannot create leave for another tenant.');
      }
    }

    return this.prisma.leaveRequest.create({
      data: {
        ...dto,
        employeeId,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
      },
    });
  }

  async update(id: string, dto: UpdateLeaveRequestDto, user: RequestUser) {
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
      throw new ForbiddenException('Cannot update leave for another tenant.');
    }

    return this.prisma.leaveRequest.update({ where: { id }, data: dto });
  }

  async remove(id: string, user: RequestUser) {
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
}
