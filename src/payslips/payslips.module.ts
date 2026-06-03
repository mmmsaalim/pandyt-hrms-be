import { Module } from '@nestjs/common';
import { PayslipsController } from './payslips.controller';
import { PayslipsService } from './payslips.service';
import { PayslipsPdfService } from './payslips-pdf.service';

@Module({
  controllers: [PayslipsController],
  providers: [PayslipsService, PayslipsPdfService],
})
export class PayslipsModule {}
