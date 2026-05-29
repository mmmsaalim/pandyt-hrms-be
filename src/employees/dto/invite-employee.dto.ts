import { IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class InviteEmployeeDto {
  @IsString()
  name!: string;

  @IsEmail()
  workEmail!: string;

  @IsString()
  department!: string;

  @IsString()
  designation!: string;

  @IsString()
  @IsIn(['EMPLOYEE', 'HR_MANAGER', 'TEAM_LEAD', 'COMPANY_ADMIN'])
  role!: 'EMPLOYEE' | 'HR_MANAGER' | 'TEAM_LEAD' | 'COMPANY_ADMIN';

  @IsOptional()
  @IsString()
  employeeCode?: string;
}