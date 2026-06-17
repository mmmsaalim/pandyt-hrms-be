import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class TenantFieldConfigDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
