import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { EmailModule } from '../email/email.module';
import { TenantsBillingReminderService } from './tenants-billing-reminder.service';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';

@Module({
  imports: [EmailModule, TenantConfigurationModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantsBillingReminderService],
  exports: [TenantsService],
})
export class TenantsModule {}
