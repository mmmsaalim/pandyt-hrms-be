import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateAttendanceDto {
  @IsString()
  employeeId!: string;

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
