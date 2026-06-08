import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { EmploymentStatusEnum } from './create-employee.dto';

export class UpdateEmployeeDto {
  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsDateString()
  joinedDate?: string;

  @IsOptional()
  @IsEnum(EmploymentStatusEnum)
  employmentStatus?: EmploymentStatusEnum;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salary?: number;
}
