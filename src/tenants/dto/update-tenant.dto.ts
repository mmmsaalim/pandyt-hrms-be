import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TenantLeadStatusEnum, TenantStatusEnum } from './create-tenant.dto';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  companyCode?: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsEnum(TenantStatusEnum)
  status?: TenantStatusEnum;

  @IsOptional()
  @IsEnum(TenantLeadStatusEnum)
  leadStatus?: TenantLeadStatusEnum;

  @IsOptional()
  @IsInt()
  @Min(1)
  seats?: number;
}
