import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

type RequestUser = { sub: string; roles?: string[] } | undefined;

@Injectable()
export class AttendanceService {
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
      return this.prisma.attendance.findMany({
        where: { employeeId: employeeContext.id },
        include: { employee: true },
      });
    }

    if (this.hasRole(user, 'COMPANY_ADMIN')) {
      return this.prisma.attendance.findMany({
        where: { employee: { tenantId: employeeContext.tenantId } },
        include: { employee: true },
      });
    }

    throw new ForbiddenException('Insufficient role permission.');
  }

  async create(dto: CreateAttendanceDto, user: RequestUser) {
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
        throw new ForbiddenException('Cannot create attendance for another tenant.');
      }
    }

    return this.prisma.attendance.create({
      data: {
        employeeId,
        date: new Date(dto.date),
        clockIn: dto.clockIn ? new Date(dto.clockIn) : null,
        clockOut: dto.clockOut ? new Date(dto.clockOut) : null,
        hours: dto.hours,
        status: dto.status,
      },
    });
  }

  async update(id: string, dto: UpdateAttendanceDto, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const adminEmployeeContext = await this.getEmployeeContext(user.sub);
    if (!adminEmployeeContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
      select: {
        employee: {
          select: { tenantId: true },
        },
      },
    });

    if (
      !attendance ||
      attendance.employee.tenantId !== adminEmployeeContext.tenantId
    ) {
      throw new ForbiddenException('Cannot update attendance for another tenant.');
    }

    return this.prisma.attendance.update({ where: { id }, data: dto });
  }

  async remove(id: string, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const adminEmployeeContext = await this.getEmployeeContext(user.sub);
    if (!adminEmployeeContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
      select: {
        employee: {
          select: { tenantId: true },
        },
      },
    });

    if (
      !attendance ||
      attendance.employee.tenantId !== adminEmployeeContext.tenantId
    ) {
      throw new ForbiddenException('Cannot remove attendance for another tenant.');
    }

    return this.prisma.attendance.delete({ where: { id } });
  }
}
