import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class PlatformPlanCatalogEntryDto {
  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  seats?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceLkr?: number | null;

  @IsString()
  description!: string;

  @IsArray()
  @IsString({ each: true })
  defaultModules!: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class SavePlatformPlansDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PlatformPlanCatalogEntryDto)
  plans!: PlatformPlanCatalogEntryDto[];
}
