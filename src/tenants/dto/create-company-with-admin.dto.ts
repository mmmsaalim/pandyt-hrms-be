import { IsEmail, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateCompanyWithAdminDto {
  @IsString()
  companyName!: string;

  @IsString()
  adminName!: string;

  @IsEmail()
  adminEmail!: string;

  @IsString()
  subscriptionPlan!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  seats?: number;
}