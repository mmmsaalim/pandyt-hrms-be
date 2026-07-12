import { Module, forwardRef } from '@nestjs/common';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { LeaveAccrualService } from './leave-accrual.service';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';
import { AttendanceCalculationModule } from '../attendance/attendance-calculation.module';

@Module({
  imports: [forwardRef(() => TenantConfigurationModule), AttendanceCalculationModule],
  controllers: [LeaveController],
  providers: [LeaveService, LeaveAccrualService],
  exports: [LeaveService, LeaveAccrualService],
})
export class LeaveModule {}
