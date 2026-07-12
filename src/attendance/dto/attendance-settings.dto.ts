import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpdateAttendanceSettingsDto {
  @IsOptional()
  @IsString()
  scheduleMode?: string;

  @IsOptional()
  @IsString()
  workStartTime?: string;

  @IsOptional()
  @IsString()
  workEndTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  lateArrivalGraceMinutes?: number;

  @IsOptional()
  @IsString()
  lateArrivalAction?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  lateArrivalRepeatedThreshold?: number;

  @IsOptional()
  @IsString()
  lateArrivalEscalationAction?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  earlyDepartureGraceMinutes?: number;

  @IsOptional()
  @IsString()
  earlyDepartureAction?: string;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  weekendDays?: number[];

  @IsOptional()
  @IsBoolean()
  overtimeEnabled?: boolean;

  @IsOptional()
  @IsObject()
  overtimeRules?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  missingClockInAction?: string;

  @IsOptional()
  @IsString()
  missingClockOutAction?: string;

  @IsOptional()
  @IsString()
  missingBothAction?: string;

  @IsOptional()
  @IsBoolean()
  autoAbsentEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  requireManagerApproval?: boolean;

  @IsOptional()
  @IsObject()
  payrollIntegration?: Record<string, unknown>;
}

export class UpsertWorkShiftDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  startTime?: string;

  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  breakMinutes?: number;

  @IsOptional()
  @IsBoolean()
  isNightShift?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  overtimeEligible?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  flexibleGraceMinutes?: number;
}

export class UpsertCompanyHolidayDto {
  @IsString()
  name!: string;

  @IsString()
  date!: string;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsBoolean()
  isPaid?: boolean;
}
