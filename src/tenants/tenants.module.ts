import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { EmailModule } from '../email/email.module';
import { TenantsBillingReminderService } from './tenants-billing-reminder.service';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';
import { LeaveModule } from '../leave/leave.module';

@Module({
  imports: [EmailModule, TenantConfigurationModule, LeaveModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantsBillingReminderService],
  exports: [TenantsService],
})
export class TenantsModule {}
