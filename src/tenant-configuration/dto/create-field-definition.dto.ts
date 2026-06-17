import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateFieldDefinitionDto {
  @IsString()
  fieldKey!: string;

  @IsString()
  label!: string;

  @IsString()
  fieldType!: string;

  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
