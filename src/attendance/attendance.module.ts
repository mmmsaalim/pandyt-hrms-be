import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  imports: [TenantConfigurationModule],
  controllers: [AttendanceController],
  providers: [AttendanceService, PermissionsGuard],
})
export class AttendanceModule {}
