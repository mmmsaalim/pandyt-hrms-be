import { IsEnum, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { LeaveStatusEnum } from './create-leave-request.dto';

export class UpdateLeaveRequestDto {
  @IsOptional()
  @IsEnum(LeaveStatusEnum)
  status?: LeaveStatusEnum;

  @ValidateIf((dto) => dto.status === LeaveStatusEnum.REJECTED)
  @IsString()
  @MinLength(3, { message: 'Rejection reason must be at least 3 characters.' })
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  approvalComment?: string;
}
