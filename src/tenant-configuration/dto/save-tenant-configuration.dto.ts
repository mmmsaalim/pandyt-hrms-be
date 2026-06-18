import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { TenantFieldConfigDto } from './tenant-field-config.dto';

export class TenantLocaleConfigDto {
  @IsOptional()
  @IsString()
  locale?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  fiscalYearStartMonth?: number;

  @IsOptional()
  @IsString()
  payslipTemplateKey?: string;

  @IsOptional()
  @IsObject()
  leaveSetup?: {
    preset?: string;
    policies?: Array<{
      code?: string;
      name: string;
      days: number;
      carryForwardLimit?: number;
      accrualRate?: number;
      sortOrder?: number;
      description?: string;
      genderScope?: string;
    }>;
  };
}

export class SaveTenantConfigurationDto {
  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enabledModules?: string[];

  @IsOptional()
  @IsObject()
  moduleFeatures?: Record<string, Record<string, TenantFieldConfigDto>>;

  @IsOptional()
  @ValidateNested()
  @Type(() => TenantLocaleConfigDto)
  config?: TenantLocaleConfigDto;
}
