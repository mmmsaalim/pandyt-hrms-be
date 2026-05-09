import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpdateCandidateDto {
  @IsOptional()
  @IsString()
  stage?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}
