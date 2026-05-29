import { IsDateString, IsInt, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAttendanceDto {
  @IsInt()
  employeeId!: number;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsDateString()
  clockIn?: string;

  @IsOptional()
  @IsDateString()
  clockOut?: string;

  @IsNumber()
  hours!: number;

  @IsString()
  status!: string;
}
