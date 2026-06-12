import { IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PipelineStage } from '@prisma/client';

export class CreateCandidateDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  jobPostId?: number;

  @IsString()
  roleApplied!: string;

  @IsString()
  source!: string;

  @IsOptional()
  @IsEnum(PipelineStage)
  stage?: PipelineStage;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
