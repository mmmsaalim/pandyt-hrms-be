import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class OffboardEmployeeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}
