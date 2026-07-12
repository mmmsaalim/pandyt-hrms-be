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

  resolveWorkingDaysPerMonth(payroll: PayrollIntegrationConfig): number {
    const days = payroll.workingDaysPerMonth ?? DEFAULT_PAYROLL_INTEGRATION.workingDaysPerMonth;
    return days > 0 ? days : DEFAULT_PAYROLL_INTEGRATION.workingDaysPerMonth;
  }

  resolveStandardHoursPerDay(payroll: PayrollIntegrationConfig): number {
    const hours = payroll.standardHoursPerDay ?? DEFAULT_PAYROLL_INTEGRATION.standardHoursPerDay;
    return hours > 0 ? hours : DEFAULT_PAYROLL_INTEGRATION.standardHoursPerDay;
  }

  resolveDailySalary(salary: number, payroll: PayrollIntegrationConfig): number {
    if (salary <= 0) {
      return 0;
    }
    return salary / this.resolveWorkingDaysPerMonth(payroll);
  }

  resolveSalaryHourlyRate(
    salary: number,
    payroll: PayrollIntegrationConfig,
    scheduledHours?: number,
  ): number {
    const dailySalary = this.resolveDailySalary(salary, payroll);
    const hoursForRate =
      scheduledHours && scheduledHours > 0
        ? scheduledHours
        : this.resolveStandardHoursPerDay(payroll);
    if (dailySalary <= 0 || hoursForRate <= 0) {
      return 0;
    }
    return dailySalary / hoursForRate;
  }

  resolveOvertimeHourlyRate(
    salary: number,
    overtimeRules: OvertimeRuleConfig,
    payroll: PayrollIntegrationConfig,
  ): number {
    if (overtimeRules.payMode === 'FIXED') {
      return overtimeRules.fixedRateLkr ?? 0;
    }
    const workingDays = this.resolveWorkingDaysPerMonth(payroll);
    const standardHours = this.resolveStandardHoursPerDay(payroll);
    if (salary <= 0 || workingDays <= 0 || standardHours <= 0) {
      return 0;
    }
    return salary / (workingDays * standardHours);
  }

  computeOvertimePay(
    salary: number,
    overtimeHours: number,
    overtimeRules: OvertimeRuleConfig,
    payroll: PayrollIntegrationConfig,
  ): number {
    if (overtimeHours <= 0) {
      return 0;
    }
    const hourlyRate = this.resolveOvertimeHourlyRate(salary, overtimeRules, payroll);
    return Math.round(overtimeHours * hourlyRate * 100) / 100;
  }

  isWeekendDay(date: Date, weekendDays: number[]): boolean {
    return weekendDays.includes(date.getDay());
  }

  parseWeekdayList(raw: unknown, fallback: number[] = []): number[] {
    if (!Array.isArray(raw)) {
      return [...fallback];
    }
    return raw
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  }

  /**
   * Tenant calendar: weekendDays = full OFF, halfWorkingDays = HALF, everything else FULL.
   * Half days must not overlap weekends (weekends win as OFF).
   */
  resolveWeekdayKind(
    date: Date,
    weekendDays: number[],
    halfWorkingDays: number[] = [],
  ): 'OFF' | 'HALF' | 'FULL' {
    const day = date.getDay();
    if (weekendDays.includes(day)) {
      return 'OFF';
    }
    if (halfWorkingDays.includes(day)) {
      return 'HALF';
    }
    return 'FULL';
  }

  /** Leave day weight for one calendar date (0 / 0.5 / 1), after holiday override. */
  resolveLeaveDayWeight(options: {
    date: Date;
    weekendDays: number[];
    halfWorkingDays?: number[];
    holiday?: { isHalfDay?: boolean } | null;
  }): number {
    if (options.holiday) {
      return options.holiday.isHalfDay ? 0.5 : 0;
    }
    const kind = this.resolveWeekdayKind(
      options.date,
      options.weekendDays,
      options.halfWorkingDays ?? [],
    );
    if (kind === 'OFF') {
      return 0;
    }
    if (kind === 'HALF') {
      return 0.5;
    }
    return 1;
  }

  countLeaveWorkingDays(options: {
    startDate: Date;
    endDate: Date;
    weekendDays: number[];
    halfWorkingDays?: number[];
    holidays?: Array<{ date: Date; isHalfDay?: boolean }>;
  }): number {
    const start = new Date(options.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(options.endDate);
    end.setHours(0, 0, 0, 0);
    if (end < start) {
      return 0;
    }

    const holidayByKey = new Map<string, { isHalfDay?: boolean }>();
    for (const holiday of options.holidays ?? []) {
      const key = this.toDateKey(holiday.date);
      holidayByKey.set(key, holiday);
    }

    let total = 0;
    for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const key = this.toDateKey(cursor);
      total += this.resolveLeaveDayWeight({
        date: cursor,
        weekendDays: options.weekendDays,
        halfWorkingDays: options.halfWorkingDays,
        holiday: holidayByKey.get(key) ?? null,
      });
    }
    return Math.round(total * 100) / 100;
  }

  toDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /** Night shift: end time is on the next calendar day when end <= start or flag set. */
  resolveScheduledEnd(schedule: ScheduleWindow, date: Date, isNightShift = false): Date {
    const end = this.parseTimeOnDate(schedule.workEndTime, date);
    const start = this.parseTimeOnDate(schedule.workStartTime, date);
    if (isNightShift || end.getTime() <= start.getTime()) {
      end.setDate(end.getDate() + 1);
    }
    return end;
  }

  roundDays(value: number): number {
    return Math.round(value * 100) / 100;
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
      let effectiveScheduledEnd = scheduledEnd;
      if (effectiveScheduledEnd.getTime() <= scheduledStart.getTime()) {
        effectiveScheduledEnd = new Date(effectiveScheduledEnd.getTime() + 24 * 60 * 60_000);
      }
      const scheduledMinutes = (effectiveScheduledEnd.getTime() - scheduledStart.getTime()) / 60_000;
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
    monthlySalary = 0,
  ): number {
    let adjustment = 0;

    if (payroll.deductLateArrivals && lateMinutes > 0) {
      adjustment += this.resolveLateDeduction(
        payroll,
        dailySalary,
        scheduledHours,
        lateMinutes,
        lateAction,
        monthlySalary,
      );
    }

    if (payroll.deductEarlyDepartures && earlyMinutes > 0) {
      adjustment += this.resolveEarlyDeduction(
        payroll,
        dailySalary,
        scheduledHours,
        earlyMinutes,
        earlyAction,
        monthlySalary,
      );
    }

    return Math.round(adjustment * 100) / 100;
  }

  private resolveLateDeduction(
    payroll: PayrollIntegrationConfig,
    dailySalary: number,
    scheduledHours: number,
    lateMinutes: number,
    lateAction: string,
    monthlySalary: number,
  ): number {
    if (payroll.lateDeductionMode === 'FIXED') {
      return payroll.lateFixedAmountLkr ?? 0;
    }
    return this.salaryBasedDeduction(
      lateAction,
      dailySalary,
      scheduledHours,
      lateMinutes,
      monthlySalary,
      payroll,
    );
  }

  private resolveEarlyDeduction(
    payroll: PayrollIntegrationConfig,
    dailySalary: number,
    scheduledHours: number,
    earlyMinutes: number,
    earlyAction: string,
    monthlySalary: number,
  ): number {
    if (payroll.earlyDeductionMode === 'FIXED') {
      return payroll.earlyFixedAmountLkr ?? 0;
    }
    return this.salaryBasedDeduction(
      earlyAction,
      dailySalary,
      scheduledHours,
      earlyMinutes,
      monthlySalary,
      payroll,
    );
  }

  private salaryBasedDeduction(
    action: string,
    dailySalary: number,
    scheduledHours: number,
    minutes: number,
    monthlySalary: number,
    payroll: PayrollIntegrationConfig,
  ): number {
    const hoursForRate =
      scheduledHours > 0 ? scheduledHours : this.resolveStandardHoursPerDay(payroll);
    if (dailySalary <= 0 && monthlySalary <= 0) {
      return 0;
    }
    const resolvedDaily =
      dailySalary > 0 ? dailySalary : this.resolveDailySalary(monthlySalary, payroll);
    const hourlyRate =
      hoursForRate > 0
        ? resolvedDaily / hoursForRate
        : this.resolveSalaryHourlyRate(monthlySalary, payroll, scheduledHours);
    return this.actionDeduction(action, hourlyRate, minutes, resolvedDaily);
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
