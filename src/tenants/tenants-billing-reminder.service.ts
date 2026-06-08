import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TenantsService } from './tenants.service';

@Injectable()
export class TenantsBillingReminderService {
  private readonly logger = new Logger(TenantsBillingReminderService.name);

  constructor(private readonly tenantsService: TenantsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async runDailyReminders() {
    this.logger.log('Starting daily billing reminder schedule...');

    try {
      const result = await this.tenantsService.sendScheduledBillingReminders();
      this.logger.log(
        `Billing reminders complete. Tenants processed=${result.tenantsProcessed}, reminded=${result.tenantsReminded}, emails=${result.emailsSent}`,
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Daily billing reminder schedule failed: ${errMsg}`, error);
    }
  }
}
