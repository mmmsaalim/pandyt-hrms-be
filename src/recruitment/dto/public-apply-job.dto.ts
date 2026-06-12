import { IsEmail, IsOptional, IsString } from 'class-validator';

export class PublicApplyJobDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  coverLetter?: string;
}
