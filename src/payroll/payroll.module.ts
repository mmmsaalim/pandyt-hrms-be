import { Module } from '@nestjs/common';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';

@Module({
  imports: [TenantConfigurationModule],
  controllers: [PayrollController],
  providers: [PayrollService],
})
export class PayrollModule {}
