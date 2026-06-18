import { Module } from '@nestjs/common';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { CanteenController } from './canteen.controller';
import { CanteenService } from './canteen.service';

@Module({
  imports: [TenantConfigurationModule],
  controllers: [CanteenController],
  providers: [CanteenService, PermissionsGuard],
})
export class CanteenModule {}

