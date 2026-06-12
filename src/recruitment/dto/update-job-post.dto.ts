import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { JobPostStatus } from '@prisma/client';

export class UpdateJobPostDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredSkills?: string[];

  @IsOptional()
  @IsEnum(JobPostStatus)
  status?: JobPostStatus;
}
