import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { InvitationsModule } from '../invitations/invitations.module';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';

@Module({
  imports: [InvitationsModule, TenantConfigurationModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
