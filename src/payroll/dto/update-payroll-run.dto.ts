import { IsOptional, IsString } from 'class-validator';

export class UpdatePayrollRunDto {
  @IsOptional()
  @IsString()
  period?: string;
}
