import { IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, Min, ValidateIf } from 'class-validator';

export class InviteEmployeeDto {
  @IsString()
  name!: string;

  @ValidateIf((dto: InviteEmployeeDto) => dto.onboardingMode !== 'MANUAL_ONLY')
  @IsEmail()
  workEmail?: string;

  @IsOptional()
  @IsString()
  @IsIn(['EMAIL_INVITE', 'MANUAL_ONLY'])
  onboardingMode?: 'EMAIL_INVITE' | 'MANUAL_ONLY';

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

  @IsOptional()
  @IsObject()
  customFields?: Record<string, unknown>;
}