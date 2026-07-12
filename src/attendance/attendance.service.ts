import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
            overtimeEligible: true,
            isNightShift: true,
            flexibleGraceMinutes: true,
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

  private async resolveSchedule(
    tenantId: number,
    settings: { workStartTime: string; workEndTime: string; halfDayEndTime?: string; halfWorkingDays?: unknown },
    shift?: {
      startTime: string;
      endTime: string;
      breakMinutes: number;
      isNightShift?: boolean;
      flexibleGraceMinutes?: number;
    } | null,
    date?: Date,
  ) {
    let schedule = {
      workStartTime: settings.workStartTime,
      workEndTime: settings.workEndTime,
      breakMinutes: 0,
      isNightShift: false,
      flexibleGraceMinutes: 0,
    };

    if (shift) {
      schedule = {
        workStartTime: shift.startTime,
        workEndTime: shift.endTime,
        breakMinutes: shift.breakMinutes,
        isNightShift: shift.isNightShift ?? false,
        flexibleGraceMinutes: shift.flexibleGraceMinutes ?? 0,
      };
    } else {
      const defaultShift = await this.prisma.workShift.findFirst({
        where: { tenantId, isDefault: true, isActive: true },
      });
      if (defaultShift) {
        schedule = {
          workStartTime: defaultShift.startTime,
          workEndTime: defaultShift.endTime,
          breakMinutes: defaultShift.breakMinutes,
          isNightShift: defaultShift.isNightShift,
          flexibleGraceMinutes: defaultShift.flexibleGraceMinutes,
        };
      }
    }

    if (date) {
      const halfWorkingDays = this.calculation.parseWeekdayList(settings.halfWorkingDays, []);
      if (halfWorkingDays.includes(date.getDay()) && settings.halfDayEndTime) {
        schedule = { ...schedule, workEndTime: settings.halfDayEndTime };
      }
    }

    return schedule;
  }

  private async getDayContext(
    tenantId: number,
    employeeId: number,
    date: Date,
    settings: { weekendDays: unknown; halfWorkingDays?: unknown },
  ) {
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const weekendDays = this.calculation.parseWeekdayList(settings.weekendDays, [6, 0]);
    const halfWorkingDays = this.calculation.parseWeekdayList(settings.halfWorkingDays, []);
    const weekdayKind = this.calculation.resolveWeekdayKind(dayStart, weekendDays, halfWorkingDays);

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
    const isFullHoliday = !!holiday && !holiday.isHalfDay;

    return {
      date: dayStart,
      isWeekend: weekdayKind === 'OFF',
      isHalfWorkingDay: weekdayKind === 'HALF' || (!!holiday && holiday.isHalfDay),
      isHoliday: isFullHoliday,
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
        include: {
          employee: {
            select: {
              salary: true,
              user: { select: { firstName: true, lastName: true, email: true } },
            },
          },
        },
      });
    }

    if (this.hasRole(user, 'COMPANY_ADMIN') || this.hasRole(user, 'HR_MANAGER')) {
      return this.prisma.attendance.findMany({
        where: { employee: { tenantId: employeeContext.tenantId } },
        include: {
          employee: {
            select: {
              salary: true,
              user: { select: { firstName: true, lastName: true, email: true } },
            },
          },
        },
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
        include: {
          employee: {
            select: {
              salary: true,
              user: { select: { firstName: true, lastName: true, email: true } },
            },
          },
        },
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

    const schedule = await this.resolveSchedule(
      employeeContext.tenantId,
      settings,
      employeeContext.shift,
      today,
    );
    const dayContext = await this.getDayContext(
      employeeContext.tenantId,
      employeeContext.id,
      today,
      settings,
    );
    const lateGrace =
      settings.lateArrivalGraceMinutes +
      (settings.scheduleMode === 'FLEXIBLE' ? (employeeContext.shift?.flexibleGraceMinutes ?? 0) : 0);
    const lateMinutes = this.calculation.computeLateMinutes(now, schedule, lateGrace);
    const status = this.calculation.resolveAttendanceStatus(
      dayContext,
      lateMinutes,
      0,
      true,
      !!existing?.clockOut,
      {
        missingClockInAction: settings.missingClockInAction,
        missingClockOutAction: settings.missingClockOutAction,
        missingBothAction: settings.missingBothAction,
      },
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

    const schedule = await this.resolveSchedule(
      employeeContext.tenantId,
      settings,
      employeeContext.shift,
      today,
    );
    const dayContext = await this.getDayContext(
      employeeContext.tenantId,
      employeeContext.id,
      today,
      settings,
    );
    const metrics = await this.computeAttendanceMetrics({
      tenantId: employeeContext.tenantId,
      employeeId: employeeContext.id,
      salary: employeeContext.salary,
      overtimeEligible: employeeContext.shift?.overtimeEligible ?? true,
      isNightShift: employeeContext.shift?.isNightShift ?? schedule.isNightShift ?? false,
      flexibleGraceMinutes: employeeContext.shift?.flexibleGraceMinutes ?? 0,
      settings,
      schedule,
      dayContext,
      date: today,
      clockIn: new Date(existing.clockIn),
      clockOut: now,
      existingLateMinutes: existing.lateMinutes,
    });

    return this.prisma.attendance.update({
      where: { id: existing.id },
      data: {
        clockOut: now,
        hours: metrics.hours,
        earlyDepartureMinutes: metrics.earlyDepartureMinutes,
        overtimeHours: metrics.overtimeHours,
        payrollAdjustment: metrics.payrollAdjustment,
        status: metrics.status,
      },
    });
  }

  private async countMonthlyLateArrivals(employeeId: number, date: Date, lateMinutesToday: number): Promise<number> {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const dayStart = new Date(date);
    dayStart.setHours(0, 0, 0, 0);

    const priorLateCount = await this.prisma.attendance.count({
      where: {
        employeeId,
        date: { gte: monthStart, lt: monthEnd, not: dayStart },
        lateMinutes: { gt: 0 },
      },
    });

    return priorLateCount + (lateMinutesToday > 0 ? 1 : 0);
  }

  private async computeAttendanceMetrics(input: {
    tenantId: number;
    employeeId: number;
    salary: number;
    overtimeEligible: boolean;
    isNightShift?: boolean;
    flexibleGraceMinutes?: number;
    settings: {
      scheduleMode?: string;
      workStartTime: string;
      workEndTime: string;
      lateArrivalGraceMinutes: number;
      earlyDepartureGraceMinutes: number;
      lateArrivalAction: string;
      lateArrivalRepeatedThreshold: number;
      lateArrivalEscalationAction: string;
      earlyDepartureAction: string;
      overtimeEnabled: boolean;
      overtimeRules: unknown;
      payrollIntegration: unknown;
      missingClockInAction: string;
      missingClockOutAction: string;
      missingBothAction: string;
      requireManagerApproval?: boolean;
    };
    schedule: {
      workStartTime: string;
      workEndTime: string;
      breakMinutes: number;
      isNightShift?: boolean;
      flexibleGraceMinutes?: number;
    };
    dayContext: Awaited<ReturnType<AttendanceService['getDayContext']>>;
    date: Date;
    clockIn: Date;
    clockOut: Date;
    existingLateMinutes?: number;
  }) {
    const flexibleExtra =
      input.settings.scheduleMode === 'FLEXIBLE'
        ? (input.flexibleGraceMinutes ?? input.schedule.flexibleGraceMinutes ?? 0)
        : 0;
    const lateGrace = input.settings.lateArrivalGraceMinutes + flexibleExtra;
    const lateMinutes =
      input.existingLateMinutes !== undefined
        ? input.existingLateMinutes
        : this.calculation.computeLateMinutes(input.clockIn, input.schedule, lateGrace);

    const isNightShift = input.isNightShift ?? input.schedule.isNightShift ?? false;
    const scheduledEnd = this.calculation.resolveScheduledEnd(input.schedule, input.date, isNightShift);
    const earlyGraceMs = input.settings.earlyDepartureGraceMinutes * 60_000;
    const earlyGraceStart = new Date(scheduledEnd.getTime() - earlyGraceMs);
    const earlyMinutes =
      input.clockOut.getTime() >= earlyGraceStart.getTime()
        ? 0
        : Math.round((earlyGraceStart.getTime() - input.clockOut.getTime()) / 60_000);

    const hours = this.calculation.computeWorkedHours(
      input.clockIn,
      input.clockOut,
      input.schedule.breakMinutes,
    );
    const overtimeRules = this.calculation.resolveOvertimeRules(input.settings.overtimeRules);
    const otSchedule = {
      workStartTime: input.schedule.workStartTime,
      workEndTime: `${String(scheduledEnd.getHours()).padStart(2, '0')}:${String(scheduledEnd.getMinutes()).padStart(2, '0')}`,
      breakMinutes: input.schedule.breakMinutes,
    };
    // Night-shift OT: compare against absolute end via clockOut date window.
    let overtimeHours =
      input.settings.overtimeEnabled && overtimeRules.enabled && input.overtimeEligible
        ? this.calculation.computeOvertimeHours(
            input.clockIn,
            input.clockOut,
            isNightShift
              ? {
                  workStartTime: input.schedule.workStartTime,
                  workEndTime: input.schedule.workEndTime,
                  breakMinutes: input.schedule.breakMinutes,
                }
              : otSchedule,
            overtimeRules,
            input.dayContext,
          )
        : 0;

    if (isNightShift && overtimeHours === 0 && overtimeRules.enabled && input.overtimeEligible) {
      const overtimeMinutes = Math.max(
        0,
        Math.round((input.clockOut.getTime() - scheduledEnd.getTime()) / 60_000),
      );
      if (overtimeMinutes >= overtimeRules.minimumMinutes) {
        let rounded = overtimeMinutes;
        if (overtimeRules.roundToMinutes > 0) {
          rounded = Math.floor(overtimeMinutes / overtimeRules.roundToMinutes) * overtimeRules.roundToMinutes;
        }
        let multiplier = overtimeRules.weekdayMultiplier;
        if (input.dayContext.isHoliday) {
          multiplier = overtimeRules.holidayMultiplier;
        } else if (input.dayContext.isWeekend) {
          multiplier = overtimeRules.weekendMultiplier;
        }
        overtimeHours = Math.round((rounded / 60) * multiplier * 100) / 100;
      }
    }

    // requireManagerApproval / OT requiresApproval: hours kept; payroll skips cash OT when approval required.

    const payrollIntegration = this.calculation.resolvePayrollIntegration(
      input.settings.payrollIntegration,
    );
    const scheduledStart = this.calculation.parseTimeOnDate(input.schedule.workStartTime, input.date);
    const scheduledHours = Math.max(
      0,
      (scheduledEnd.getTime() - scheduledStart.getTime()) / (1000 * 60 * 60) -
        input.schedule.breakMinutes / 60,
    );
    const dailySalary = this.calculation.resolveDailySalary(input.salary, payrollIntegration);
    const monthlyLateCount = await this.countMonthlyLateArrivals(
      input.employeeId,
      input.date,
      lateMinutes,
    );
    const lateAction =
      monthlyLateCount >= input.settings.lateArrivalRepeatedThreshold
        ? input.settings.lateArrivalEscalationAction
        : input.settings.lateArrivalAction;
    const payrollAdjustment = this.calculation.estimatePayrollAdjustment(
      dailySalary,
      scheduledHours,
      lateMinutes,
      earlyMinutes,
      lateAction,
      input.settings.earlyDepartureAction,
      payrollIntegration,
      input.salary,
    );
    const status = this.calculation.resolveAttendanceStatus(
      input.dayContext,
      lateMinutes,
      earlyMinutes,
      true,
      true,
      {
        missingClockInAction: input.settings.missingClockInAction,
        missingClockOutAction: input.settings.missingClockOutAction,
        missingBothAction: input.settings.missingBothAction,
      },
    );

    return {
      lateMinutes,
      earlyDepartureMinutes: earlyMinutes,
      hours,
      overtimeHours,
      payrollAdjustment,
      status,
    };
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
      select: {
        tenantId: true,
        managerId: true,
        salary: true,
        shift: {
          select: {
            startTime: true,
            endTime: true,
            breakMinutes: true,
            overtimeEligible: true,
            isNightShift: true,
            flexibleGraceMinutes: true,
          },
        },
      },
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

    const settings = await this.ensureSettings(targetEmployee.tenantId);
    const schedule = await this.resolveSchedule(
      targetEmployee.tenantId,
      settings,
      targetEmployee.shift,
      date,
    );
    const dayContext = await this.getDayContext(targetEmployee.tenantId, dto.employeeId, date, settings);

    let payload: Prisma.AttendanceUncheckedUpdateInput = {
      clockIn: clockInDate,
      clockOut: clockOutDate,
      source: 'OVERRIDE',
      notes: dto.reason,
    };

    if (clockInDate && clockOutDate) {
      const metrics = await this.computeAttendanceMetrics({
        tenantId: targetEmployee.tenantId,
        employeeId: dto.employeeId,
        salary: targetEmployee.salary,
        overtimeEligible: targetEmployee.shift?.overtimeEligible ?? true,
        settings,
        schedule,
        dayContext,
        date,
        clockIn: clockInDate,
        clockOut: clockOutDate,
      });
      payload = {
        ...payload,
        hours: metrics.hours,
        lateMinutes: metrics.lateMinutes,
        earlyDepartureMinutes: metrics.earlyDepartureMinutes,
        overtimeHours: metrics.overtimeHours,
        payrollAdjustment: metrics.payrollAdjustment,
        status: `MANUAL_OVERRIDE:${metrics.status}`,
      };
    } else {
      const status = this.calculation.resolveAttendanceStatus(
        dayContext,
        0,
        0,
        !!clockInDate,
        !!clockOutDate,
        {
          missingClockInAction: settings.missingClockInAction,
          missingClockOutAction: settings.missingClockOutAction,
          missingBothAction: settings.missingBothAction,
        },
      );
      payload = {
        ...payload,
        hours: 0,
        lateMinutes: 0,
        earlyDepartureMinutes: 0,
        overtimeHours: 0,
        payrollAdjustment: 0,
        status: `MANUAL_OVERRIDE:${status}`,
      };
    }

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
        lateMinutes: (payload.lateMinutes as number | undefined) ?? 0,
        earlyDepartureMinutes: (payload.earlyDepartureMinutes as number | undefined) ?? 0,
        overtimeHours: (payload.overtimeHours as number | undefined) ?? 0,
        payrollAdjustment: (payload.payrollAdjustment as number | undefined) ?? 0,
        hours: (payload.hours as number | undefined) ?? 0,
        status: (payload.status as string | undefined) ?? 'MANUAL_OVERRIDE:INCOMPLETE',
        clockIn: clockInDate,
        clockOut: clockOutDate,
        source: 'OVERRIDE',
        notes: dto.reason,
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

    const existing = await this.ensureSettings(tenantId);
    const overtimeRules =
      dto.overtimeRules !== undefined || dto.overtimeEnabled !== undefined
        ? (this.calculation.normalizeSettings(
            {
              ...(existing.overtimeRules && typeof existing.overtimeRules === 'object'
                ? (existing.overtimeRules as Record<string, unknown>)
                : {}),
              ...(dto.overtimeRules ?? {}),
              ...(dto.overtimeEnabled !== undefined ? { enabled: dto.overtimeEnabled } : {}),
            } as Record<string, unknown>,
            DEFAULT_OVERTIME_RULES,
          ) as Prisma.InputJsonValue)
        : undefined;

    const data = {
      ...dto,
      overtimeRules,
      payrollIntegration: dto.payrollIntegration
        ? (this.calculation.normalizeSettings(
            dto.payrollIntegration,
            DEFAULT_PAYROLL_INTEGRATION,
          ) as Prisma.InputJsonValue)
        : undefined,
      weekendDays: dto.weekendDays ? (dto.weekendDays as Prisma.InputJsonValue) : undefined,
      halfWorkingDays:
        dto.halfWorkingDays !== undefined
          ? (this.sanitizeHalfWorkingDays(dto.weekendDays ?? existing.weekendDays, dto.halfWorkingDays) as Prisma.InputJsonValue)
          : undefined,
      halfDayEndTime: dto.halfDayEndTime,
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

  private sanitizeHalfWorkingDays(weekendRaw: unknown, halfRaw: unknown): number[] {
    const weekendDays = this.calculation.parseWeekdayList(weekendRaw, [6, 0]);
    const halfWorkingDays = this.calculation.parseWeekdayList(halfRaw, []);
    return halfWorkingDays.filter((day) => !weekendDays.includes(day));
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
    if (!dto.name?.trim() || !dto.startTime || !dto.endTime) {
      throw new BadRequestException('Shift name, start time, and end time are required.');
    }
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
        isHalfDay: dto.isHalfDay ?? false,
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
