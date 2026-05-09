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
  @IsIn(['EMPLOYEE', 'COMPANY_ADMIN'])
  role!: 'EMPLOYEE' | 'COMPANY_ADMIN';

  @IsOptional()
  @IsString()
  employeeCode?: string;
}