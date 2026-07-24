import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendTenantEmailDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(8000)
  message!: string;
}
