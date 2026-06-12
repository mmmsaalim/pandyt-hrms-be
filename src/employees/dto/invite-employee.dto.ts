import { IsEmail, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class InviteEmployeeDto {
  @IsString()
  name!: string;

  @IsEmail()
  workEmail!: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  departmentId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  teamId?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  locationId?: number;

  @IsString()
  designation!: string;

  @IsString()
  @IsIn(['EMPLOYEE', 'HR_MANAGER', 'TEAM_LEAD', 'COMPANY_ADMIN'])
  role!: 'EMPLOYEE' | 'HR_MANAGER' | 'TEAM_LEAD' | 'COMPANY_ADMIN';

  @IsOptional()
  @IsString()
  employeeCode?: string;
}