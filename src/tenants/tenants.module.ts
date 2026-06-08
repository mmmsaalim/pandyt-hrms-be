import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';
import { EmailModule } from '../email/email.module';
import { TenantsBillingReminderService } from './tenants-billing-reminder.service';

@Module({
  imports: [EmailModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantsBillingReminderService],
  exports: [TenantsService],
})
export class TenantsModule {}
