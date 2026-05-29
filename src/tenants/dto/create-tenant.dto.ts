import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export enum TenantStatusEnum {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export enum TenantLeadStatusEnum {
  PENDING = 'PENDING',
  CONVERTED = 'CONVERTED',
  DELETED = 'DELETED',
}

export class CreateTenantDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  companyCode?: string;

  @IsString()
  plan!: string;

  @IsEnum(TenantStatusEnum)
  status!: TenantStatusEnum;

  @IsEnum(TenantLeadStatusEnum)
  leadStatus!: TenantLeadStatusEnum;

  @IsInt()
  @Min(1)
  seats!: number;
}
