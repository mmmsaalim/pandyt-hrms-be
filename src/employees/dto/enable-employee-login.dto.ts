import { IsEmail, IsNotEmpty } from 'class-validator';

export class EnableEmployeeLoginDto {
  @IsEmail()
  @IsNotEmpty()
  workEmail!: string;
}
