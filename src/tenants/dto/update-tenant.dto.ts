import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TenantStatusEnum } from './create-tenant.dto';

export class UpdateTenantDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsEnum(TenantStatusEnum)
  status?: TenantStatusEnum;

  @IsOptional()
  @IsInt()
  @Min(1)
  seats?: number;
}
