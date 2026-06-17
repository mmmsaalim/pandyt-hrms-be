import { Module } from '@nestjs/common';
import { OrganisationService } from './organisation.service';
import { OrganisationController } from './organisation.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';

@Module({
  imports: [PrismaModule, TenantConfigurationModule],
  providers: [OrganisationService],
  controllers: [OrganisationController],
  exports: [OrganisationService],
})
export class OrganisationModule {}
