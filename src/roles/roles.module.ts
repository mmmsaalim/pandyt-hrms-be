import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { RoleBootstrapService } from './role-bootstrap.service';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';

@Module({
  imports: [TenantConfigurationModule],
  controllers: [RolesController],
  providers: [RolesService, RoleBootstrapService],
  exports: [RolesService, RoleBootstrapService],
})
export class RolesModule {}
