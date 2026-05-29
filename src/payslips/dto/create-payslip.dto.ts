import { IsEnum, IsInt, IsNumber } from 'class-validator';

export enum PayslipStatusEnum {
  GENERATED = 'GENERATED',
  SENT = 'SENT',
}

export class CreatePayslipDto {
  @IsInt()
  employeeId!: number;

  @IsInt()
  payrollRunId!: number;

  @IsNumber()
  grossPay!: number;

  @IsNumber()
  deductions!: number;

  @IsNumber()
  netPay!: number;

  @IsEnum(PayslipStatusEnum)
  status!: PayslipStatusEnum;
}
