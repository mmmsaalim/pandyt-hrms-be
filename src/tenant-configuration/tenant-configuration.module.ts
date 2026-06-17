import { Module } from '@nestjs/common';
import { TenantConfigurationController } from './tenant-configuration.controller';
import { TenantConfigurationService } from './tenant-configuration.service';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';

@Module({
  controllers: [TenantConfigurationController],
  providers: [TenantConfigurationService, ModuleEnabledGuard],
  exports: [TenantConfigurationService, ModuleEnabledGuard],
})
export class TenantConfigurationModule {}
