import { IsDateString, IsEnum, IsInt, IsString } from 'class-validator';

export enum EmploymentStatusEnum {
  ACTIVE = 'ACTIVE',
  ON_PROBATION = 'ON_PROBATION',
  INACTIVE = 'INACTIVE',
}

export class CreateEmployeeDto {
  @IsInt()
  tenantId!: number;

  @IsInt()
  userId!: number;

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
