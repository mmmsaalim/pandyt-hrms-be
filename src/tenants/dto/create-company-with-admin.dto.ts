import { IsEmail, IsInt, IsObject, IsOptional, IsString, Min } from 'class-validator';
import { SaveTenantConfigurationDto } from '../../tenant-configuration/dto/save-tenant-configuration.dto';

export class CreateCompanyWithAdminDto {
  @IsString()
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
}