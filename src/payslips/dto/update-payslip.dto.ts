import { IsEnum, IsOptional } from 'class-validator';
import { PayslipStatusEnum } from './create-payslip.dto';

export class UpdatePayslipDto {
  @IsOptional()
  @IsEnum(PayslipStatusEnum)
  status?: PayslipStatusEnum;
}
