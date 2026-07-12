import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance.controller';
import { AttendanceSettingsController } from './attendance-settings.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceCalculationService } from './attendance-calculation.service';
import { AttendanceDayCloseService } from './attendance-day-close.service';
import { AttendanceCalculationModule } from './attendance-calculation.module';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  imports: [AttendanceCalculationModule, TenantConfigurationModule],
  controllers: [AttendanceSettingsController, AttendanceController],
  providers: [AttendanceService, AttendanceCalculationService, AttendanceDayCloseService, PermissionsGuard],
  exports: [AttendanceService, AttendanceCalculationService, AttendanceDayCloseService],
})
export class AttendanceModule {}
