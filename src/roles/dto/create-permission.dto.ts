import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePermissionDto {
  @IsString()
  @MaxLength(100)
  permission!: string;

  @IsString()
  @MaxLength(60)
  module!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
