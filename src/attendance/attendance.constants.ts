export const ATTENDANCE_ACTIONS = [
  'FLAG',
  'WARN',
  'DEDUCT_FIXED',
  'DEDUCT_HOURLY',
  'DEDUCT_HALF_DAY',
  'DEDUCT_FULL_DAY',
  'DEDUCT_LEAVE',
] as const;

export type AttendanceAction = (typeof ATTENDANCE_ACTIONS)[number];

export const SCHEDULE_MODES = ['FIXED', 'FLEXIBLE', 'SHIFT'] as const;
export type ScheduleMode = (typeof SCHEDULE_MODES)[number];

export const WEEKEND_PRESETS = {
  SAT_SUN: [6, 0],
  FRI_SAT: [5, 6],
  SUN_ONLY: [0],
} as const;

export const MISSING_ATTENDANCE_ACTIONS = [
  'FLAG',
  'ABSENT',
  'REQUEST_CORRECTION',
  'MANAGER_APPROVAL',
  'AUTO_LEAVE_DEDUCTION',
] as const;

export type MissingAttendanceAction = (typeof MISSING_ATTENDANCE_ACTIONS)[number];

export type OvertimeRuleConfig = {
  enabled: boolean;
  startAfterScheduledEnd: boolean;
  minimumMinutes: number;
  roundToMinutes: number;
  weekdayMultiplier: number;
  weekendMultiplier: number;
  holidayMultiplier: number;
  compensationMode: 'PAY' | 'TIME_OFF' | 'NONE';
  requiresApproval: boolean;
};

export type PayrollIntegrationConfig = {
  useAttendanceForPayableHours: boolean;
  ignoreApprovedLeave: boolean;
  ignoreCompanyHolidays: boolean;
  ignoreWeekends: boolean;
  deductLateArrivals: boolean;
  deductEarlyDepartures: boolean;
  deductAbsences: boolean;
  includeOvertime: boolean;
  missingClockOutPolicy: 'USE_SCHEDULED_END' | 'FLAG' | 'ABSENT';
};

export const DEFAULT_OVERTIME_RULES: OvertimeRuleConfig = {
  enabled: false,
  startAfterScheduledEnd: true,
  minimumMinutes: 15,
  roundToMinutes: 15,
  weekdayMultiplier: 1.5,
  weekendMultiplier: 2,
  holidayMultiplier: 2.5,
  compensationMode: 'PAY',
  requiresApproval: false,
};

export const DEFAULT_PAYROLL_INTEGRATION: PayrollIntegrationConfig = {
  useAttendanceForPayableHours: true,
  ignoreApprovedLeave: true,
  ignoreCompanyHolidays: true,
  ignoreWeekends: true,
  deductLateArrivals: false,
  deductEarlyDepartures: false,
  deductAbsences: true,
  includeOvertime: false,
  missingClockOutPolicy: 'USE_SCHEDULED_END',
};

export const LEAVE_ATTENDANCE_EXEMPT_TYPES = [
  'annual',
  'casual',
  'sick',
  'medical',
  'maternity',
  'paternity',
  'work_from_home',
  'business_travel',
  'half_day',
] as const;
