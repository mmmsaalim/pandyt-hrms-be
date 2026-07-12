import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceCalculationService } from './attendance-calculation.service';
import { AUTO_LEAVE_DEDUCTION_POLICY_ORDER } from './attendance.constants';

type ScheduleWindow = {
  workStartTime: string;
  workEndTime: string;
  breakMinutes: number;
  isNightShift?: boolean;
};

@Injectable()
export class AttendanceDayCloseService {
  private readonly logger = new Logger(AttendanceDayCloseService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly calculation: AttendanceCalculationService,
  ) {}

  /** Runs daily at 23:45 server time to finalize missing attendance for the current day. */
  @Cron('45 23 * * *')
  async closeOpenAttendanceDays(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const settingsRows = await this.prisma.attendanceSettings.findMany();
    for (const settings of settingsRows) {
      try {
        await this.closeTenantDay(settings.tenantId, today, settings);
      } catch (error) {
        this.logger.error(`Day close failed for tenant ${settings.tenantId}`, error);
      }
    }
  }

  async closeTenantDay(tenantId: number, date: Date, settings?: Prisma.AttendanceSettingsGetPayload<object>) {
    const resolvedSettings =
      settings ??
      (await this.prisma.attendanceSettings.findUnique({ where: { tenantId } })) ??
      (await this.prisma.attendanceSettings.create({
        data: { tenantId },
      }));

    if (!resolvedSettings.autoAbsentEnabled) {
      return;
    }

    const payrollIntegration = this.calculation.resolvePayrollIntegration(
      resolvedSettings.payrollIntegration,
    );

    const employees = await this.prisma.employee.findMany({
      where: { tenantId, employmentStatus: 'ACTIVE', deletedAt: null },
      select: {
        id: true,
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

    for (const employee of employees) {
      const dayContext = await this.getDayContext(tenantId, employee.id, date, resolvedSettings);

      // Respect payroll ignore flags + calendar OFF / full holiday / full-day leave.
      if (dayContext.isWeekend && payrollIntegration.ignoreWeekends) {
        continue;
      }
      if (dayContext.isHoliday && payrollIntegration.ignoreCompanyHolidays) {
        continue;
      }
      if (dayContext.isWeekend || dayContext.isHoliday || (dayContext.hasApprovedLeave && !dayContext.isHalfDayLeave)) {
        continue;
      }

      const schedule = await this.resolveSchedule(tenantId, resolvedSettings, employee.shift, date);
      const existing = await this.prisma.attendance.findUnique({
        where: {
          employeeId_date: {
            employeeId: employee.id,
            date,
          },
        },
      });

      if (!existing) {
        const status = this.calculation.resolveAttendanceStatus(
          dayContext,
          0,
          0,
          false,
          false,
          {
            missingClockInAction: resolvedSettings.missingClockInAction,
            missingClockOutAction: resolvedSettings.missingClockOutAction,
            missingBothAction: resolvedSettings.missingBothAction,
          },
        );

        let notes: string | null = null;
        if (this.isAutoLeaveDeductionStatus(status, resolvedSettings)) {
          notes = await this.deductAutoLeaveForMissingAttendance(tenantId, employee.id, date);
        }

        await this.prisma.attendance.create({
          data: {
            employeeId: employee.id,
            date,
            status,
            source: 'AUTO',
            lateMinutes: 0,
            earlyDepartureMinutes: 0,
            hours: 0,
            overtimeHours: 0,
            payrollAdjustment: 0,
            notes,
          },
        });
        continue;
      }

      if (existing.clockIn && !existing.clockOut) {
        const clockIn = new Date(existing.clockIn);
        let clockOut = new Date();

        if (payrollIntegration.missingClockOutPolicy === 'USE_SCHEDULED_END') {
          clockOut = this.calculation.resolveScheduledEnd(
            schedule,
            date,
            employee.shift?.isNightShift ?? false,
          );
        } else if (payrollIntegration.missingClockOutPolicy === 'ABSENT') {
          await this.prisma.attendance.update({
            where: { id: existing.id },
            data: {
              status: 'ABSENT',
              hours: 0,
              earlyDepartureMinutes: 0,
              overtimeHours: 0,
              payrollAdjustment: 0,
            },
          });
          continue;
        }

        const metrics = this.buildMetrics(
          resolvedSettings,
          schedule,
          employee.salary,
          employee.shift?.overtimeEligible ?? true,
          dayContext,
          clockIn,
          clockOut,
          existing.lateMinutes,
          employee.shift?.isNightShift ?? false,
        );

        await this.prisma.attendance.update({
          where: { id: existing.id },
          data: {
            clockOut,
            ...metrics,
            source: existing.source === 'CLOCK' ? 'CLOCK' : existing.source,
          },
        });
      }
    }
  }

  private isAutoLeaveDeductionStatus(
    status: string,
    settings: Prisma.AttendanceSettingsGetPayload<object>,
  ): boolean {
    return (
      status === 'MISSING_LEAVE' ||
      settings.missingBothAction === 'AUTO_LEAVE_DEDUCTION' ||
      settings.missingClockInAction === 'AUTO_LEAVE_DEDUCTION'
    );
  }

  /**
   * Deduct 1 working day from Casual first, then Annual. Returns employee-facing note.
   */
  private async deductAutoLeaveForMissingAttendance(
    tenantId: number,
    employeeId: number,
    date: Date,
  ): Promise<string> {
    const policies = await this.prisma.leavePolicy.findMany({
      where: { tenantId },
    });

    for (const code of AUTO_LEAVE_DEDUCTION_POLICY_ORDER) {
      const policy = policies.find(
        (row) =>
          row.code?.toLowerCase() === code ||
          row.name.toLowerCase().includes(code),
      );
      if (!policy) {
        continue;
      }

      const balance = await this.prisma.leaveBalance.findUnique({
        where: {
          employeeId_leavePolicyId: {
            employeeId,
            leavePolicyId: policy.id,
          },
        },
      });

      const available = balance ? balance.allocated - balance.used : 0;
      if (available < 1) {
        continue;
      }

      if (balance) {
        await this.prisma.leaveBalance.update({
          where: { id: balance.id },
          data: { used: { increment: 1 } },
        });
      } else {
        await this.prisma.leaveBalance.create({
          data: {
            tenantId,
            employeeId,
            leavePolicyId: policy.id,
            allocated: policy.days,
            used: 1,
            accrued: 0,
          },
        });
      }

      const dateLabel = this.calculation.toDateKey(date);
      return `Missing attendance on ${dateLabel}: 1 day deducted from ${policy.name} leave balance. Please clock in/out daily to avoid leave deductions.`;
    }

    const dateLabel = this.calculation.toDateKey(date);
    return `Missing attendance on ${dateLabel}: marked for leave deduction, but no Casual/Annual balance was available.`;
  }

  private buildMetrics(
    settings: Prisma.AttendanceSettingsGetPayload<object>,
    schedule: ScheduleWindow,
    salary: number,
    overtimeEligible: boolean,
    dayContext: {
      isWeekend: boolean;
      isHoliday: boolean;
    },
    clockIn: Date,
    clockOut: Date,
    existingLateMinutes: number,
    isNightShift: boolean,
  ) {
    const lateMinutes =
      existingLateMinutes > 0
        ? existingLateMinutes
        : this.calculation.computeLateMinutes(clockIn, schedule, settings.lateArrivalGraceMinutes);
    const scheduledEnd = this.calculation.resolveScheduledEnd(schedule, clockIn, isNightShift);
    const earlyGraceStart = new Date(
      scheduledEnd.getTime() - settings.earlyDepartureGraceMinutes * 60_000,
    );
    const earlyMinutes =
      clockOut.getTime() >= earlyGraceStart.getTime()
        ? 0
        : Math.round((earlyGraceStart.getTime() - clockOut.getTime()) / 60_000);
    const hours = this.calculation.computeWorkedHours(clockIn, clockOut, schedule.breakMinutes);
    const overtimeRules = this.calculation.resolveOvertimeRules(settings.overtimeRules);
    const overtimeHours =
      settings.overtimeEnabled && overtimeRules.enabled && overtimeEligible
        ? this.calculation.computeOvertimeHours(clockIn, clockOut, schedule, overtimeRules, dayContext)
        : 0;
    const payrollIntegration = this.calculation.resolvePayrollIntegration(settings.payrollIntegration);
    const scheduledStart = this.calculation.parseTimeOnDate(schedule.workStartTime, clockIn);
    const scheduledHours = Math.max(
      0,
      (scheduledEnd.getTime() - scheduledStart.getTime()) / (1000 * 60 * 60) - schedule.breakMinutes / 60,
    );
    const dailySalary = this.calculation.resolveDailySalary(salary, payrollIntegration);
    const payrollAdjustment = this.calculation.estimatePayrollAdjustment(
      dailySalary,
      scheduledHours,
      lateMinutes,
      earlyMinutes,
      settings.lateArrivalAction,
      settings.earlyDepartureAction,
      payrollIntegration,
      salary,
    );
    const status = this.calculation.resolveAttendanceStatus(
      dayContext as Parameters<AttendanceCalculationService['resolveAttendanceStatus']>[0],
      lateMinutes,
      earlyMinutes,
      true,
      true,
      {
        missingClockInAction: settings.missingClockInAction,
        missingClockOutAction: settings.missingClockOutAction,
        missingBothAction: settings.missingBothAction,
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

  private async resolveSchedule(
    tenantId: number,
    settings: {
      workStartTime: string;
      workEndTime: string;
      halfDayEndTime?: string;
      halfWorkingDays?: unknown;
    },
    shift?: {
      startTime: string;
      endTime: string;
      breakMinutes: number;
      isNightShift?: boolean;
    } | null,
    date?: Date,
  ): Promise<ScheduleWindow> {
    let schedule: ScheduleWindow = {
      workStartTime: settings.workStartTime,
      workEndTime: settings.workEndTime,
      breakMinutes: 0,
      isNightShift: false,
    };

    if (shift) {
      schedule = {
        workStartTime: shift.startTime,
        workEndTime: shift.endTime,
        breakMinutes: shift.breakMinutes,
        isNightShift: shift.isNightShift ?? false,
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
      isHoliday: isFullHoliday,
      hasApprovedLeave: !!approvedLeave,
      leaveType,
      isHalfDayLeave,
    };
  }
}
