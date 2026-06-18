import { Module, forwardRef } from '@nestjs/common';
import { LeaveController } from './leave.controller';
import { LeaveService } from './leave.service';
import { LeaveAccrualService } from './leave-accrual.service';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';

@Module({
  imports: [forwardRef(() => TenantConfigurationModule)],
  controllers: [LeaveController],
  providers: [LeaveService, LeaveAccrualService],
  exports: [LeaveService],
})
export class LeaveModule {}
