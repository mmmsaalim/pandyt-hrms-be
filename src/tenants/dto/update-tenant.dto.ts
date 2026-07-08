import { IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TenantLeadStatusEnum, TenantStatusEnum } from './create-tenant.dto';
import { TenantCompanyProfileDto } from './tenant-company-profile.dto';

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

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantCompanyProfileDto)
  companyProfile?: TenantCompanyProfileDto;
}
