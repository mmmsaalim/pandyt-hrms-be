import { Module, forwardRef } from '@nestjs/common';
import { TenantConfigurationController } from './tenant-configuration.controller';
import { TenantConfigurationService } from './tenant-configuration.service';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { LeaveModule } from '../leave/leave.module';

@Module({
  imports: [forwardRef(() => LeaveModule)],
  controllers: [TenantConfigurationController],
  providers: [TenantConfigurationService, ModuleEnabledGuard],
  exports: [TenantConfigurationService, ModuleEnabledGuard],
})
export class TenantConfigurationModule {}
