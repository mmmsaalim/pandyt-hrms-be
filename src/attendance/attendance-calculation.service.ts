import { Injectable } from '@nestjs/common';
import {
  DEFAULT_OVERTIME_RULES,
  DEFAULT_PAYROLL_INTEGRATION,
  OvertimeRuleConfig,
  PayrollIntegrationConfig,
} from './attendance.constants';

type ScheduleWindow = {
  workStartTime: string;
  workEndTime: string;
  breakMinutes?: number;
};

type DayContext = {
  date: Date;
  isWeekend: boolean;
  isHoliday: boolean;
  hasApprovedLeave: boolean;
  leaveType?: string;
  isHalfDayLeave?: boolean;
};

@Injectable()
export class AttendanceCalculationService {
  parseTimeOnDate(time: string, date: Date): Date {
    const [hours, minutes] = time.split(':').map((part) => Number(part));
    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    return result;
  }

  normalizeSettings<T extends Record<string, unknown>>(raw: T | null | undefined, defaults: T): T {
    if (!raw || typeof raw !== 'object') {
      return { ...defaults };
    }
    return { ...defaults, ...raw };
  }

  resolveOvertimeRules(raw: unknown): OvertimeRuleConfig {
    return this.normalizeSettings(
      (raw && typeof raw === 'object' ? raw : {}) as OvertimeRuleConfig,
      DEFAULT_OVERTIME_RULES,
    );
  }

  resolvePayrollIntegration(raw: unknown): PayrollIntegrationConfig {
    return this.normalizeSettings(
      (raw && typeof raw === 'object' ? raw : {}) as PayrollIntegrationConfig,
      DEFAULT_PAYROLL_INTEGRATION,
    );
  }

  isWeekendDay(date: Date, weekendDays: number[]): boolean {
    return weekendDays.includes(date.getDay());
  }

  computeLateMinutes(clockIn: Date, schedule: ScheduleWindow, graceMinutes: number): number {
    const scheduledStart = this.parseTimeOnDate(schedule.workStartTime, clockIn);
    const graceEnd = new Date(scheduledStart.getTime() + graceMinutes * 60_000);
    if (clockIn <= graceEnd) {
      return 0;
    }
    return Math.round((clockIn.getTime() - graceEnd.getTime()) / 60_000);
  }

  computeEarlyDepartureMinutes(clockOut: Date, schedule: ScheduleWindow, graceMinutes: number): number {
    const scheduledEnd = this.parseTimeOnDate(schedule.workEndTime, clockOut);
    const graceStart = new Date(scheduledEnd.getTime() - graceMinutes * 60_000);
    if (clockOut >= graceStart) {
      return 0;
    }
    return Math.round((graceStart.getTime() - clockOut.getTime()) / 60_000);
  }

  computeWorkedHours(clockIn: Date, clockOut: Date, breakMinutes = 0): number {
    const rawHours = (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60);
    const breakHours = breakMinutes / 60;
    return Math.max(0, Math.round((rawHours - breakHours) * 100) / 100);
  }

  computeOvertimeHours(
    clockIn: Date | null,
    clockOut: Date | null,
    schedule: ScheduleWindow,
    rules: OvertimeRuleConfig,
    context: Pick<DayContext, 'isWeekend' | 'isHoliday'>,
  ): number {
    if (!rules.enabled || !clockIn || !clockOut) {
      return 0;
    }

    const scheduledEnd = this.parseTimeOnDate(schedule.workEndTime, clockOut);
    let overtimeMinutes = 0;

    if (rules.startAfterScheduledEnd) {
      overtimeMinutes = Math.max(0, Math.round((clockOut.getTime() - scheduledEnd.getTime()) / 60_000));
    } else {
      const scheduledStart = this.parseTimeOnDate(schedule.workStartTime, clockIn);
      const scheduledMinutes = (scheduledEnd.getTime() - scheduledStart.getTime()) / 60_000;
      const workedMinutes = (clockOut.getTime() - clockIn.getTime()) / 60_000;
      overtimeMinutes = Math.max(0, Math.round(workedMinutes - scheduledMinutes));
    }

    if (overtimeMinutes < rules.minimumMinutes) {
      return 0;
    }

    if (rules.roundToMinutes > 0) {
      overtimeMinutes = Math.floor(overtimeMinutes / rules.roundToMinutes) * rules.roundToMinutes;
    }

    let multiplier = rules.weekdayMultiplier;
    if (context.isHoliday) {
      multiplier = rules.holidayMultiplier;
    } else if (context.isWeekend) {
      multiplier = rules.weekendMultiplier;
    }

    const overtimeHours = overtimeMinutes / 60;
    return Math.round(overtimeHours * multiplier * 100) / 100;
  }

  resolveMissingAttendanceStatus(
    missingClockInAction: string,
    missingClockOutAction: string,
    missingBothAction: string,
    hasClockIn: boolean,
    hasClockOut: boolean,
  ): string | null {
    if (hasClockIn && hasClockOut) {
      return null;
    }

    if (!hasClockIn && !hasClockOut) {
      return this.mapMissingAttendanceAction(missingBothAction);
    }

    if (!hasClockIn) {
      return this.mapMissingAttendanceAction(missingClockInAction);
    }

    return this.mapMissingAttendanceAction(missingClockOutAction);
  }

  private mapMissingAttendanceAction(action: string): string {
    switch (action) {
      case 'ABSENT':
        return 'ABSENT';
      case 'REQUEST_CORRECTION':
        return 'MISSING_CORRECTION';
      case 'MANAGER_APPROVAL':
        return 'MISSING_APPROVAL';
      case 'AUTO_LEAVE_DEDUCTION':
        return 'MISSING_LEAVE';
      case 'FLAG':
      default:
        return 'INCOMPLETE';
    }
  }

  resolveAttendanceStatus(
    context: DayContext,
    lateMinutes: number,
    earlyMinutes: number,
    hasClockIn: boolean,
    hasClockOut: boolean,
    missingActions?: {
      missingClockInAction: string;
      missingClockOutAction: string;
      missingBothAction: string;
    },
  ): string {
    if (context.hasApprovedLeave && !context.isHalfDayLeave) {
      return `ON_LEAVE:${context.leaveType ?? 'APPROVED'}`;
    }

    if (context.isHoliday) {
      return 'HOLIDAY';
    }

    if (context.isWeekend) {
      return 'WEEKEND';
    }

    if (!hasClockIn && !hasClockOut) {
      if (missingActions) {
        return this.mapMissingAttendanceAction(missingActions.missingBothAction);
      }
      return 'ABSENT';
    }

    if (!hasClockIn || !hasClockOut) {
      if (missingActions) {
        return (
          this.resolveMissingAttendanceStatus(
            missingActions.missingClockInAction,
            missingActions.missingClockOutAction,
            missingActions.missingBothAction,
            hasClockIn,
            hasClockOut,
          ) ?? 'INCOMPLETE'
        );
      }
      return 'INCOMPLETE';
    }

    if (lateMinutes > 0 && earlyMinutes > 0) {
      return 'LATE_AND_EARLY';
    }

    if (lateMinutes > 0) {
      return 'LATE';
    }

    if (earlyMinutes > 0) {
      return 'EARLY_DEPARTURE';
    }

    return 'PRESENT';
  }

  estimatePayrollAdjustment(
    dailySalary: number,
    scheduledHours: number,
    lateMinutes: number,
    earlyMinutes: number,
    lateAction: string,
    earlyAction: string,
    payroll: PayrollIntegrationConfig,
  ): number {
    if (scheduledHours <= 0 || dailySalary <= 0) {
      return 0;
    }

    let adjustment = 0;
    const hourlyRate = dailySalary / scheduledHours;

    if (payroll.deductLateArrivals && lateMinutes > 0) {
      adjustment += this.actionDeduction(lateAction, hourlyRate, lateMinutes, dailySalary);
    }

    if (payroll.deductEarlyDepartures && earlyMinutes > 0) {
      adjustment += this.actionDeduction(earlyAction, hourlyRate, earlyMinutes, dailySalary);
    }

    return Math.round(adjustment * 100) / 100;
  }

  private actionDeduction(action: string, hourlyRate: number, minutes: number, dailySalary: number): number {
    switch (action) {
      case 'DEDUCT_FIXED':
        return hourlyRate;
      case 'DEDUCT_HOURLY':
        return (minutes / 60) * hourlyRate;
      case 'DEDUCT_HALF_DAY':
        return dailySalary / 2;
      case 'DEDUCT_FULL_DAY':
        return dailySalary;
      case 'DEDUCT':
      case 'DEDUCT_LEAVE':
        return (minutes / 60) * hourlyRate;
      default:
        return 0;
    }
  }
}
