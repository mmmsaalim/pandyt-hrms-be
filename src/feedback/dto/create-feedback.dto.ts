import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateFeedbackDto {
  @IsOptional()
  @IsString()
  subjectLabel?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsString()
  @MinLength(5)
  body!: string;

  @IsOptional()
  @IsString()
  contextModule?: string;
}
