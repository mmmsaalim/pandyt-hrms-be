import { IsNumber, IsObject, IsOptional, Max, Min } from 'class-validator';

export class SavePlatformBillingDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  taxRate?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  overageSeatPriceLkr?: number;

  @IsOptional()
  @IsObject()
  plans?: Record<string, { monthlyPriceLkr?: number | null; seats?: number | null }>;
}
