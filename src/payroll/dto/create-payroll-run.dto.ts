import { IsDateString, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';

export enum PayrollStatusEnum {
  DRAFT = 'DRAFT',
  PROCESSED = 'PROCESSED',
}

export class CreatePayrollRunDto {
  @IsString()
  tenantId!: string;

  @IsString()
  period!: string;

  @IsNumber()
  grossAmount!: number;

  @IsNumber()
  netAmount!: number;

  @IsEnum(PayrollStatusEnum)
  status!: PayrollStatusEnum;

  @IsOptional()
  @IsDateString()
  processedAt?: string;
}
