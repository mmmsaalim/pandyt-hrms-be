import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export enum LeaveStatusEnum {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class CreateLeaveRequestDto {
  @IsOptional()
  @IsInt()
  employeeId?: number;

  @IsString()
  type!: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsNumber()
  days!: number;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsEnum(LeaveStatusEnum)
  status?: LeaveStatusEnum;
}
