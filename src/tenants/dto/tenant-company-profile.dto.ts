import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/** Sri Lanka company registry / statutory details stored in tenant.config.companyProfile */
export class TenantCompanyProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  brNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  registeredAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  district?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  industryType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  companyPhone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  companyEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  adminPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  tinNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
