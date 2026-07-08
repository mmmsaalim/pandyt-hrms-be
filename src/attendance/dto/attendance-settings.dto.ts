export class UpdateAttendanceSettingsDto {
  scheduleMode?: string;
  workStartTime?: string;
  workEndTime?: string;
  lateArrivalGraceMinutes?: number;
  lateArrivalAction?: string;
  lateArrivalRepeatedThreshold?: number;
  lateArrivalEscalationAction?: string;
  earlyDepartureGraceMinutes?: number;
  earlyDepartureAction?: string;
  weekendDays?: number[];
  overtimeEnabled?: boolean;
  overtimeRules?: Record<string, unknown>;
  missingClockInAction?: string;
  missingClockOutAction?: string;
  missingBothAction?: string;
  autoAbsentEnabled?: boolean;
  requireManagerApproval?: boolean;
  payrollIntegration?: Record<string, unknown>;
}

export class UpsertWorkShiftDto {
  name!: string;
  startTime!: string;
  endTime!: string;
  breakMinutes?: number;
  isNightShift?: boolean;
  isDefault?: boolean;
  isActive?: boolean;
  overtimeEligible?: boolean;
  flexibleGraceMinutes?: number;
}

export class UpsertCompanyHolidayDto {
  name!: string;
  date!: string;
  isRecurring?: boolean;
  isPaid?: boolean;
}
