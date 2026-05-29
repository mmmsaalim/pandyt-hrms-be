import { IsString } from 'class-validator';

export class CreatePayrollRunDto {
  @IsString()
  period!: string;
}
