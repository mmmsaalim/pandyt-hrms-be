import { IsOptional, IsString } from 'class-validator';

export class DashboardFilterDto {
  @IsOptional()
  @IsString()
  tenantId?: string;
}
