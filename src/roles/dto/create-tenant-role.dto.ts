import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTenantRoleDto {
  @IsString()
  @MaxLength(80)
  role!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
