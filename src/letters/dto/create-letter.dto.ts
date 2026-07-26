import { IsEmail, IsInt, IsOptional, IsPositive, IsString, MinLength } from 'class-validator';

export class CreateLetterDto {
  @IsString()
  @MinLength(2)
  title!: string;

  @IsOptional()
  @IsString()
  letterType?: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsString()
  @MinLength(10)
  body!: string;
}

export class UpdateLetterDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  title?: string;

  @IsOptional()
  @IsString()
  letterType?: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  @MinLength(10)
  body?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class SendLetterEmailDto {
  // Send to an existing employee (their login email is resolved server-side).
  @IsOptional()
  @IsInt()
  @IsPositive()
  employeeId?: number;

  // Or send to an explicit email address (e.g. a candidate not yet onboarded).
  @IsOptional()
  @IsEmail()
  email?: string;

  // Optional display name to address the recipient when sending to a raw email.
  @IsOptional()
  @IsString()
  recipientName?: string;
}
