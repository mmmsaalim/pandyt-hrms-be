import { IsOptional, IsString, MinLength } from 'class-validator';

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
