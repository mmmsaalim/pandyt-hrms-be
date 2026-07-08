import { Type } from 'class-transformer';
import {
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { TenantFieldConfigDto } from './tenant-field-config.dto';

export class LetterheadConfigDto {
  @IsOptional()
  @IsString()
  companyDisplayName?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}

export class ReportTemplateDto {
  @IsString()
  id!: string;

  @IsString()
  name!: string;

  @IsString()
  type!: string;

  @IsOptional()
  @IsString()
  content?: string;
}

export class SaveCompanyAdminConfigurationDto {
  @IsOptional()
  @IsObject()
  moduleFeatures?: Record<string, Record<string, TenantFieldConfigDto>>;

  @IsOptional()
  @ValidateNested()
  @Type(() => LetterheadConfigDto)
  letterhead?: LetterheadConfigDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportTemplateDto)
  reportTemplates?: ReportTemplateDto[];

  @IsOptional()
  @IsString()
  payslipTemplateKey?: string;
}

export class CreateTenantCustomFieldDto {
  @IsString()
  fieldKey!: string;

  @IsString()
  label!: string;

  @IsString()
  fieldType!: string;

  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;
}
