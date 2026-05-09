import { IsEnum, IsNumber, IsString } from 'class-validator';

export enum PayslipStatusEnum {
  GENERATED = 'GENERATED',
  SENT = 'SENT',
}

export class CreatePayslipDto {
  @IsString()
  employeeId!: string;

  @IsString()
  payrollRunId!: string;

  @IsNumber()
  grossPay!: number;

  @IsNumber()
  deductions!: number;

  @IsNumber()
  netPay!: number;

  @IsEnum(PayslipStatusEnum)
  status!: PayslipStatusEnum;
}
