import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceCalculationService } from './attendance-calculation.service';

type ScheduleWindow = {
  workStartTime: string;
  workEndTime: string;
  breakMinutes: number;
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
          },
        },
      },
    });

    for (const employee of employees) {
      const dayContext = await this.getDayContext(tenantId, employee.id, date, resolvedSettings);
      if (dayContext.isWeekend || dayContext.isHoliday || (dayContext.hasApprovedLeave && !dayContext.isHalfDayLeave)) {
        continue;
      }

      const schedule = await this.resolveSchedule(tenantId, resolvedSettings, employee.shift);
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
          },
        });
        continue;
      }

      if (existing.clockIn && !existing.clockOut) {
        const clockIn = new Date(existing.clockIn);
        let clockOut = new Date();

        if (payrollIntegration.missingClockOutPolicy === 'USE_SCHEDULED_END') {
          clockOut = this.calculation.parseTimeOnDate(schedule.workEndTime, date);
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
  ) {
    const lateMinutes =
      existingLateMinutes > 0
        ? existingLateMinutes
        : this.calculation.computeLateMinutes(clockIn, schedule, settings.lateArrivalGraceMinutes);
    const earlyMinutes = this.calculation.computeEarlyDepartureMinutes(
      clockOut,
      schedule,
      settings.earlyDepartureGraceMinutes,
    );
    const hours = this.calculation.computeWorkedHours(clockIn, clockOut, schedule.breakMinutes);
    const overtimeRules = this.calculation.resolveOvertimeRules(settings.overtimeRules);
    const overtimeHours =
      settings.overtimeEnabled && overtimeRules.enabled && overtimeEligible
        ? this.calculation.computeOvertimeHours(clockIn, clockOut, schedule, overtimeRules, dayContext)
        : 0;
    const payrollIntegration = this.calculation.resolvePayrollIntegration(settings.payrollIntegration);
    const scheduledStart = this.calculation.parseTimeOnDate(schedule.workStartTime, clockIn);
    const scheduledEnd = this.calculation.parseTimeOnDate(schedule.workEndTime, clockOut);
    const scheduledHours = Math.max(
      0,
      (scheduledEnd.getTime() - scheduledStart.getTime()) / (1000 * 60 * 60) - schedule.breakMinutes / 60,
    );
    const dailySalary = salary / 22;
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
    settings: { workStartTime: string; workEndTime: string },
    shift?: { startTime: string; endTime: string; breakMinutes: number } | null,
  ): Promise<ScheduleWindow> {
    if (shift) {
      return {
        workStartTime: shift.startTime,
        workEndTime: shift.endTime,
        breakMinutes: shift.breakMinutes,
      };
    }

    const defaultShift = await this.prisma.workShift.findFirst({
      where: { tenantId, isDefault: true, isActive: true },
    });
    if (defaultShift) {
      return {
        workStartTime: defaultShift.startTime,
        workEndTime: defaultShift.endTime,
        breakMinutes: defaultShift.breakMinutes,
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
}
