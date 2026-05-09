import { IsDateString, IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { EmploymentStatusEnum } from './create-employee.dto';

export class CreateCompanyEmployeeDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  firstName!: string;

  @IsString()
  lastName!: string;

  @IsString()
  employeeCode!: string;

  @IsString()
  department!: string;

  @IsString()
  designation!: string;

  @IsDateString()
  joinedDate!: string;

  @IsEnum(EmploymentStatusEnum)
  employmentStatus!: EmploymentStatusEnum;
}