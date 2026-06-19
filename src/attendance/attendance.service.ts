import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

type RequestUser = { sub: number; roles?: string[] } | undefined;

@Injectable()
export class AttendanceService {
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
      return this.prisma.attendance.findMany({
        where: { employeeId: employeeContext.id },
        include: { employee: { include: { user: true } } },
      });
    }

    if (this.hasRole(user, 'COMPANY_ADMIN') || this.hasRole(user, 'HR_MANAGER')) {
      return this.prisma.attendance.findMany({
        where: { employee: { tenantId: employeeContext.tenantId } },
        include: { employee: { include: { user: true } } },
      });
    }

    if (this.hasRole(user, 'TEAM_LEAD')) {
      return this.prisma.attendance.findMany({
        where: {
          employee: {
            tenantId: employeeContext.tenantId,
            managerId: employeeContext.id,
          },
        },
        include: { employee: { include: { user: true } } },
      });
    }

    throw new ForbiddenException('Insufficient role permission.');
  }

  async clockIn(user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const employeeContext = await this.getEmployeeContext(user.sub);
    if (!employeeContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await this.prisma.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: employeeContext.id,
          date: today,
        },
      },
    });

    if (existing && existing.clockIn) {
      throw new ForbiddenException('You have already clocked in for today.');
    }

    const now = new Date();
    const lateThreshold = new Date(today);
    // Sri Lanka standard tardiness threshold (e.g., 09:15 AM check)
    lateThreshold.setHours(9, 15, 0, 0);
    const status = now > lateThreshold ? 'LATE' : 'PRESENT';

    if (existing) {
      return this.prisma.attendance.update({
        where: { id: existing.id },
        data: {
          clockIn: now,
          status,
        },
      });
    }

    return this.prisma.attendance.create({
      data: {
        employeeId: employeeContext.id,
        date: today,
        clockIn: now,
        status,
        hours: 0,
      },
    });
  }

  async clockOut(user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const employeeContext = await this.getEmployeeContext(user.sub);
    if (!employeeContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existing = await this.prisma.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: employeeContext.id,
          date: today,
        },
      },
    });

    if (!existing || !existing.clockIn) {
      throw new ForbiddenException('You must clock in before clocking out.');
    }

    if (existing.clockOut) {
      throw new ForbiddenException('You have already clocked out for today.');
    }

    const now = new Date();
    const hours = (now.getTime() - new Date(existing.clockIn).getTime()) / (1000 * 60 * 60);

    return this.prisma.attendance.update({
      where: { id: existing.id },
      data: {
        clockOut: now,
        hours: Math.round(hours * 100) / 100,
      },
    });
  }

  async override(
    dto: { employeeId: number; date: string; clockIn?: string; clockOut?: string; reason: string },
    user: RequestUser,
  ) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    const adminContext = await this.getEmployeeContext(user.sub);
    if (!adminContext) {
      throw new ForbiddenException('Employee profile not found for this user.');
    }

    const targetEmployee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
      select: { tenantId: true, managerId: true },
    });

    if (!targetEmployee || targetEmployee.tenantId !== adminContext.tenantId) {
      throw new ForbiddenException('Cannot override attendance for another tenant employee.');
    }

    if (this.hasRole(user, 'TEAM_LEAD') && targetEmployee.managerId !== adminContext.id) {
      throw new ForbiddenException('Team lead can only override attendance for direct reports.');
    }

    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    const existing = await this.prisma.attendance.findUnique({
      where: {
        employeeId_date: {
          employeeId: dto.employeeId,
          date,
        },
      },
    });

    const clockInDate = dto.clockIn ? new Date(dto.clockIn) : null;
    const clockOutDate = dto.clockOut ? new Date(dto.clockOut) : null;

    let computedHours = 0;
    if (clockInDate && clockOutDate) {
      computedHours = (clockOutDate.getTime() - clockInDate.getTime()) / (1000 * 60 * 60);
      computedHours = Math.round(computedHours * 100) / 100;
    }

    if (existing) {
      return this.prisma.attendance.update({
        where: { id: existing.id },
        data: {
          clockIn: clockInDate,
          clockOut: clockOutDate,
          hours: computedHours,
          status: `MANUAL_OVERRIDE: ${dto.reason.substring(0, 50)}`,
        },
      });
    }

    return this.prisma.attendance.create({
      data: {
        employeeId: dto.employeeId,
        date,
        clockIn: clockInDate,
        clockOut: clockOutDate,
        hours: computedHours,
        status: `MANUAL_OVERRIDE: ${dto.reason.substring(0, 50)}`,
      },
    });
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

    const targetEmployee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { tenantId: true },
    });

    if (!targetEmployee) {
      throw new ForbiddenException('Employee not found.');
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

  async update(id: number, dto: UpdateAttendanceDto, user: RequestUser) {
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

  async remove(id: number, user: RequestUser) {
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
