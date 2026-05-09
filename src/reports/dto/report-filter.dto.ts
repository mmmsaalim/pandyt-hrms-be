import { IsOptional, IsString } from 'class-validator';

export class ReportFilterDto {
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  period?: string;
}
