import { Module } from '@nestjs/common';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { LeaveAccrualService } from './leave-accrual.service';

@Module({
  controllers: [LeaveController],
  providers: [LeaveService, LeaveAccrualService],
})
export class LeaveModule {}
