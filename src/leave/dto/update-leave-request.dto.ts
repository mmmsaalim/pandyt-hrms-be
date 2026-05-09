import { IsEnum, IsOptional, IsString } from 'class-validator';
import { LeaveStatusEnum } from './create-leave-request.dto';

export class UpdateLeaveRequestDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsEnum(LeaveStatusEnum)
  status?: LeaveStatusEnum;
}
