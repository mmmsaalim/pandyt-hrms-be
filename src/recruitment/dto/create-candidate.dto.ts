import { IsEmail, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateCandidateDto {
  @IsString()
  tenantId!: string;

  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  roleApplied!: string;

  @IsString()
  source!: string;

  @IsString()
  stage!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;
}
