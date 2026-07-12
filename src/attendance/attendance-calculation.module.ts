import { Module } from '@nestjs/common';
import { AttendanceCalculationService } from './attendance-calculation.service';

/**
 * Pure calculation helpers — no TenantConfiguration / Leave deps.
 * Import this from LeaveModule and PayrollModule to avoid circular imports.
 */
@Module({
  providers: [AttendanceCalculationService],
  exports: [AttendanceCalculationService],
})
export class AttendanceCalculationModule {}
