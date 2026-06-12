import { Module } from '@nestjs/common';
import { PublicCareersController } from './public-careers.controller';
import { RecruitmentController } from './recruitment.controller';
import { RecruitmentService } from './recruitment.service';

@Module({
  controllers: [RecruitmentController, PublicCareersController],
  providers: [RecruitmentService],
})
export class RecruitmentModule {}
