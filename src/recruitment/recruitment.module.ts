import { Module } from '@nestjs/common';
import { PublicCareersController } from './public-careers.controller';
import { RecruitmentController } from './recruitment.controller';
import { RecruitmentService } from './recruitment.service';
import { TenantConfigurationModule } from '../tenant-configuration/tenant-configuration.module';

@Module({
  imports: [TenantConfigurationModule],
  controllers: [RecruitmentController, PublicCareersController],
  providers: [RecruitmentService],
})
export class RecruitmentModule {}
