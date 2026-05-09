import { IsDateString, IsEnum, IsNumber, IsString } from 'class-validator';

export enum LeaveStatusEnum {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export class CreateLeaveRequestDto {
  @IsString()
  employeeId!: string;

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

  @IsEnum(LeaveStatusEnum)
  status!: LeaveStatusEnum;
}
