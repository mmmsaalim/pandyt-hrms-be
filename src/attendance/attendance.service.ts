import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import {
  UpdateAttendanceSettingsDto,
  UpsertCompanyHolidayDto,
  UpsertWorkShiftDto,
} from './dto/attendance-settings.dto';
import { AttendanceCalculationService } from './attendance-calculation.service';
import {
  DEFAULT_OVERTIME_RULES,
  DEFAULT_PAYROLL_INTEGRATION,
} from './attendance.constants';

type RequestUser = { sub: number; roles?: string[] } | undefined;

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calculation: AttendanceCalculationService,
  ) {}

  private hasRole(user: RequestUser, role: string): boolean {
    return (user?.roles ?? []).includes(role);
  }

  private async getEmployeeContext(userId: number) {
    return this.prisma.employee.findUnique({
      where: { userId },
      select: {
        id: true,
        tenantId: true,
        salary: true,
        shiftId: true,
        shift: {
          select: {
            startTime: true,
            endTime: true,
            breakMinutes: true,
          },
        },
      },
    });
  }

  private async ensureSettings(tenantId: number) {
    const existing = await this.prisma.attendanceSettings.findUnique({ where: { tenantId } });
    if (existing) {
      return existing;
    }

    return this.prisma.attendanceSettings.create({
      data: {
        tenantId,
        overtimeRules: DEFAULT_OVERTIME_RULES as Prisma.InputJsonValue,
        payrollIntegration: DEFAULT_PAYROLL_INTEGRATION as Prisma.InputJsonValue,
      },
    });
  }

  private resolveSchedule(
    settings: { workStartTime: string; workEndTime: string },
    shift?: { startTime: string; endTime: string; breakMinutes: number } | null,
  ) {
    if (shift) {
      return {
        workStartTime: shift.startTime,
        workEndTime: shift.endTime,
        breakMinutes: shift.breakMinutes,
      };
    }

    return {
      workStartTime: settings.workStartTime,
      workEndTime: settings.workEndTime,
      breakMinutes: 0,
    };
  }

  private async getDayContext(
    tenantId: number,
    employeeId: number,
    date: Date,
    settings: { weekendDays: unknown },
  ) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const weekendDays = Array.isArray(settings.weekendDays)
      ? (settings.weekendDays as number[])
      : [6, 0];

    const [holiday, approvedLeave] = await Promise.all([
      this.prisma.companyHoliday.findFirst({
        where: { tenantId, date: dayStart },
      }),
      this.prisma.leaveRequest.findFirst({
        where: {
          employeeId,
          status: 'APPROVED',
          startDate: { lt: dayEnd },
          endDate: { gte: dayStart },
        },
        select: { type: true, days: true },
      }),
    ]);

    const leaveType = approvedLeave?.type?.toLowerCase();
    const isHalfDayLeave = approvedLeave ? approvedLeave.days <= 0.5 : false;

    return {
      date: dayStart,
      isWeekend: this.calculation.isWeekendDay(dayStart, weekendDays),
      isHoliday: !!holiday,
      hasApprovedLeave: !!approvedLeave,
      leaveType,
      isHalfDayLeave,
    };
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
    const now = new Date();

    const [settings, existing] = await Promise.all([
      this.ensureSettings(employeeContext.tenantId),
      this.prisma.attendance.findUnique({
        where: {
          employeeId_date: {
            employeeId: employeeContext.id,
            date: today,
          },
        },
      }),
    ]);

    if (existing?.clockIn) {
      throw new ForbiddenException('You have already clocked in for today.');
    }

    const schedule = this.resolveSchedule(settings, employeeContext.shift);
    const dayContext = await this.getDayContext(
      employeeContext.tenantId,
      employeeContext.id,
      today,
      settings,
    );
    const lateMinutes = this.calculation.computeLateMinutes(
      now,
      schedule,
      settings.lateArrivalGraceMinutes,
    );
    const status = this.calculation.resolveAttendanceStatus(
      dayContext,
      lateMinutes,
      0,
      true,
      !!existing?.clockOut,
    );

    const data = {
      clockIn: now,
      status,
      lateMinutes,
      source: 'CLOCK',
    };

    if (existing) {
      return this.prisma.attendance.update({
        where: { id: existing.id },
        data,
      });
    }

    return this.prisma.attendance.create({
      data: {
        employeeId: employeeContext.id,
        date: today,
        hours: 0,
        earlyDepartureMinutes: 0,
        overtimeHours: 0,
        payrollAdjustment: 0,
        ...data,
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
    const now = new Date();

    const [settings, existing] = await Promise.all([
      this.ensureSettings(employeeContext.tenantId),
      this.prisma.attendance.findUnique({
        where: {
          employeeId_date: {
            employeeId: employeeContext.id,
            date: today,
          },
        },
      }),
    ]);

    if (!existing?.clockIn) {
      throw new ForbiddenException('You must clock in before clocking out.');
    }

    if (existing.clockOut) {
      throw new ForbiddenException('You have already clocked out for today.');
    }

    const schedule = this.resolveSchedule(settings, employeeContext.shift);
    const dayContext = await this.getDayContext(
      employeeContext.tenantId,
      employeeContext.id,
      today,
      settings,
    );
    const lateMinutes = existing.lateMinutes;
    const earlyMinutes = this.calculation.computeEarlyDepartureMinutes(
      now,
      schedule,
      settings.earlyDepartureGraceMinutes,
    );
    const hours = this.calculation.computeWorkedHours(
      new Date(existing.clockIn),
      now,
      schedule.breakMinutes,
    );
    const overtimeRules = this.calculation.resolveOvertimeRules(settings.overtimeRules);
    const overtimeHours = settings.overtimeEnabled
      ? this.calculation.computeOvertimeHours(
          new Date(existing.clockIn),
          now,
          schedule,
          overtimeRules,
          dayContext,
        )
      : 0;
    const payrollIntegration = this.calculation.resolvePayrollIntegration(settings.payrollIntegration);
    const scheduledStart = this.calculation.parseTimeOnDate(schedule.workStartTime, today);
    const scheduledEnd = this.calculation.parseTimeOnDate(schedule.workEndTime, today);
    const scheduledHours = Math.max(
      0,
      (scheduledEnd.getTime() - scheduledStart.getTime()) / (1000 * 60 * 60) -
        (schedule.breakMinutes ?? 0) / 60,
    );
    const dailySalary = employeeContext.salary / 22;
    const payrollAdjustment = this.calculation.estimatePayrollAdjustment(
      dailySalary,
      scheduledHours,
      lateMinutes,
      earlyMinutes,
      settings.lateArrivalAction,
      settings.earlyDepartureAction,
      payrollIntegration,
    );
    const status = this.calculation.resolveAttendanceStatus(
      dayContext,
      lateMinutes,
      earlyMinutes,
      true,
      true,
    );

    return this.prisma.attendance.update({
      where: { id: existing.id },
      data: {
        clockOut: now,
        hours,
        earlyDepartureMinutes: earlyMinutes,
        overtimeHours,
        payrollAdjustment,
        status,
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
      computedHours = this.calculation.computeWorkedHours(clockInDate, clockOutDate);
    }

    const payload = {
      clockIn: clockInDate,
      clockOut: clockOutDate,
      hours: computedHours,
      status: `MANUAL_OVERRIDE: ${dto.reason.substring(0, 50)}`,
      source: 'OVERRIDE',
      notes: dto.reason,
    };

    if (existing) {
      return this.prisma.attendance.update({
        where: { id: existing.id },
        data: payload,
      });
    }

    return this.prisma.attendance.create({
      data: {
        employeeId: dto.employeeId,
        date,
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        overtimeHours: 0,
        payrollAdjustment: 0,
        ...payload,
      },
    });
  }

  async create(dto: CreateAttendanceDto, user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    let employeeId = dto.employeeId;

    if (
      this.hasRole(user, 'EMPLOYEE') ||
      this.hasRole(user, 'HR_MANAGER') ||
      this.hasRole(user, 'TEAM_LEAD')
    ) {
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
        source: 'MANUAL',
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

  async getSettings(user: RequestUser) {
    if (!user?.sub) throw new ForbiddenException('Unauthorized.');
    const context = await this.getEmployeeContext(user.sub);
    if (!context) throw new ForbiddenException('Employee profile not found.');
    return this.ensureSettings(context.tenantId);
  }

  async updateSettings(dto: UpdateAttendanceSettingsDto, user: RequestUser) {
    if (!user?.sub) throw new ForbiddenException('Unauthorized.');
    const context = await this.getEmployeeContext(user.sub);
    if (!context) throw new ForbiddenException('Employee profile not found.');
    const tenantId = context.tenantId;

    const data = {
      ...dto,
      overtimeRules: dto.overtimeRules
        ? (this.calculation.normalizeSettings(dto.overtimeRules, DEFAULT_OVERTIME_RULES) as Prisma.InputJsonValue)
        : undefined,
      payrollIntegration: dto.payrollIntegration
        ? (this.calculation.normalizeSettings(
            dto.payrollIntegration,
            DEFAULT_PAYROLL_INTEGRATION,
          ) as Prisma.InputJsonValue)
        : undefined,
      weekendDays: dto.weekendDays ? (dto.weekendDays as Prisma.InputJsonValue) : undefined,
    };

    return this.prisma.attendanceSettings.upsert({
      where: { tenantId },
      create: {
        tenantId,
        ...data,
        overtimeRules:
          (data.overtimeRules as Prisma.InputJsonValue | undefined) ??
          (DEFAULT_OVERTIME_RULES as Prisma.InputJsonValue),
        payrollIntegration:
          (data.payrollIntegration as Prisma.InputJsonValue | undefined) ??
          (DEFAULT_PAYROLL_INTEGRATION as Prisma.InputJsonValue),
      },
      update: data,
    });
  }

  async listShifts(user: RequestUser) {
    const context = await this.requireTenantContext(user);
    return this.prisma.workShift.findMany({
      where: { tenantId: context.tenantId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async createShift(dto: UpsertWorkShiftDto, user: RequestUser) {
    const context = await this.requireTenantContext(user);
    if (dto.isDefault) {
      await this.prisma.workShift.updateMany({
        where: { tenantId: context.tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.workShift.create({
      data: {
        tenantId: context.tenantId,
        name: dto.name.trim(),
        startTime: dto.startTime,
        endTime: dto.endTime,
        breakMinutes: dto.breakMinutes ?? 0,
        isNightShift: dto.isNightShift ?? false,
        isDefault: dto.isDefault ?? false,
        isActive: dto.isActive ?? true,
        overtimeEligible: dto.overtimeEligible ?? true,
        flexibleGraceMinutes: dto.flexibleGraceMinutes ?? 0,
      },
    });
  }

  async updateShift(id: number, dto: UpsertWorkShiftDto, user: RequestUser) {
    const context = await this.requireTenantContext(user);
    const shift = await this.prisma.workShift.findFirst({
      where: { id, tenantId: context.tenantId },
    });
    if (!shift) {
      throw new NotFoundException('Shift not found.');
    }

    if (dto.isDefault) {
      await this.prisma.workShift.updateMany({
        where: { tenantId: context.tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.workShift.update({
      where: { id },
      data: {
        name: dto.name?.trim() ?? shift.name,
        startTime: dto.startTime ?? shift.startTime,
        endTime: dto.endTime ?? shift.endTime,
        breakMinutes: dto.breakMinutes ?? shift.breakMinutes,
        isNightShift: dto.isNightShift ?? shift.isNightShift,
        isDefault: dto.isDefault ?? shift.isDefault,
        isActive: dto.isActive ?? shift.isActive,
        overtimeEligible: dto.overtimeEligible ?? shift.overtimeEligible,
        flexibleGraceMinutes: dto.flexibleGraceMinutes ?? shift.flexibleGraceMinutes,
      },
    });
  }

  async removeShift(id: number, user: RequestUser) {
    const context = await this.requireTenantContext(user);
    const shift = await this.prisma.workShift.findFirst({
      where: { id, tenantId: context.tenantId },
    });
    if (!shift) {
      throw new NotFoundException('Shift not found.');
    }

    await this.prisma.employee.updateMany({
      where: { shiftId: id },
      data: { shiftId: null },
    });

    return this.prisma.workShift.delete({ where: { id } });
  }

  async listHolidays(user: RequestUser) {
    const context = await this.requireTenantContext(user);
    return this.prisma.companyHoliday.findMany({
      where: { tenantId: context.tenantId },
      orderBy: { date: 'asc' },
    });
  }

  async createHoliday(dto: UpsertCompanyHolidayDto, user: RequestUser) {
    const context = await this.requireTenantContext(user);
    const date = new Date(dto.date);
    date.setHours(0, 0, 0, 0);

    return this.prisma.companyHoliday.create({
      data: {
        tenantId: context.tenantId,
        name: dto.name.trim(),
        date,
        isRecurring: dto.isRecurring ?? false,
        isPaid: dto.isPaid ?? true,
      },
    });
  }

  async removeHoliday(id: number, user: RequestUser) {
    const context = await this.requireTenantContext(user);
    const holiday = await this.prisma.companyHoliday.findFirst({
      where: { id, tenantId: context.tenantId },
    });
    if (!holiday) {
      throw new NotFoundException('Holiday not found.');
    }

    return this.prisma.companyHoliday.delete({ where: { id } });
  }

  private async requireTenantContext(user: RequestUser) {
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized.');
    }

    const context = await this.getEmployeeContext(user.sub);
    if (!context) {
      throw new ForbiddenException('Employee profile not found.');
    }

    return context;
  }
}
