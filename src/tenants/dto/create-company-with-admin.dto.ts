import { IsArray, IsEmail, IsInt, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SaveTenantConfigurationDto } from '../../tenant-configuration/dto/save-tenant-configuration.dto';
import { TenantCompanyProfileDto } from './tenant-company-profile.dto';

export class CreateCompanyWithAdminDto {  @IsString()
  companyName!: string;

  @IsOptional()
  @IsString()
  companyCode?: string;

  @IsString()
  adminName!: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  subscriptionPlan!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seats?: number;

  @IsOptional()
  enabledModules?: string[];

  @IsOptional()
  @IsObject()
  moduleFeatures?: SaveTenantConfigurationDto['moduleFeatures'];

  @IsOptional()
  config?: SaveTenantConfigurationDto['config'] & Record<string, unknown>;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantCompanyProfileDto)
  companyProfile?: TenantCompanyProfileDto;

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  billingContactEmails?: string[];

  @IsOptional()
  @IsArray()
  billingReminderDays?: number[];
}