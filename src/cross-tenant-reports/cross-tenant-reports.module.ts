import { Module } from '@nestjs/common';
import { CrossTenantReportsController } from './cross-tenant-reports.controller';
import { CrossTenantReportsService } from './cross-tenant-reports.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CrossTenantReportsController],
  providers: [CrossTenantReportsService],
})
export class CrossTenantReportsModule {}
