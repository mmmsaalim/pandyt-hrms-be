import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { InvitationsModule } from '../invitations/invitations.module';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [InvitationsModule, TenantConfigurationModule, EmailModule],
  controllers: [EmployeesController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
