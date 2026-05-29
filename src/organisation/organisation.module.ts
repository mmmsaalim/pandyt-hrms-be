import { Module } from '@nestjs/common';
import { OrganisationService } from './organisation.service';
import { OrganisationController } from './organisation.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [OrganisationService],
  controllers: [OrganisationController],
  exports: [OrganisationService],
})
export class OrganisationModule {}
