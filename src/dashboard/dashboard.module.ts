import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { HrCalendarService } from './hr-calendar.service';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';

@Module({
  imports: [TenantConfigurationModule],
  controllers: [DashboardController],
  providers: [DashboardService, HrCalendarService],
})
export class DashboardModule {}
