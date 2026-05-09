import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateAttendanceDto {
  @IsOptional()
  @IsNumber()
  hours?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
