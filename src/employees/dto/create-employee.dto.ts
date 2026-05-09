import { IsDateString, IsEnum, IsString } from 'class-validator';

export enum EmploymentStatusEnum {
  ACTIVE = 'ACTIVE',
  ON_PROBATION = 'ON_PROBATION',
  INACTIVE = 'INACTIVE',
}

export class CreateEmployeeDto {
  @IsString()
  tenantId!: string;

  @IsString()
  userId!: string;

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
