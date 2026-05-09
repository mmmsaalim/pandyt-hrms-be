import { IsEnum, IsOptional } from 'class-validator';
import { PayrollStatusEnum } from './create-payroll-run.dto';

export class UpdatePayrollRunDto {
  @IsOptional()
  @IsEnum(PayrollStatusEnum)
  status?: PayrollStatusEnum;
}
