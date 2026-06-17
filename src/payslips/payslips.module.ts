import { Module } from '@nestjs/common';
import { PayslipsController } from './payslips.controller';
import { PayslipsService } from './payslips.service';
import { PayslipsPdfService } from './payslips-pdf.service';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';

@Module({
  imports: [TenantConfigurationModule],
  controllers: [PayslipsController],
  providers: [PayslipsService, PayslipsPdfService],
})
export class PayslipsModule {}
