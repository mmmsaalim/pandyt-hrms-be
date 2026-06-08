import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateBillingSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  reminderDays?: number[];

  @IsOptional()
  @IsArray()
  @IsEmail({}, { each: true })
  recipientEmails?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(250)
  subjectTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  bodyTemplate?: string;
}
