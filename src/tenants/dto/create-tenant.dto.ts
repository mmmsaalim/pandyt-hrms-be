import { IsEnum, IsInt, IsString, Min } from 'class-validator';

export enum TenantStatusEnum {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export class CreateTenantDto {
  @IsString()
  name!: string;

  @IsString()
  plan!: string;

  @IsEnum(TenantStatusEnum)
  status!: TenantStatusEnum;

  @IsInt()
  @Min(1)
  seats!: number;
}
