import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { PublicApplyJobDto } from './dto/public-apply-job.dto';
import { RecruitmentService } from './recruitment.service';

@Controller('public/careers')
export class PublicCareersController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  @Get(':companyCode/jobs')
  findOpenJobs(@Param('companyCode') companyCode: string) {
    return this.recruitmentService.findPublicOpenJobs(companyCode);
  }

  @Post(':companyCode/jobs/:jobId/apply')
  @UseInterceptors(
    FileInterceptor('resume', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  apply(
    @Param('companyCode') companyCode: string,
    @Param('jobId', ParseIntPipe) jobId: number,
    @Body() dto: PublicApplyJobDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.recruitmentService.applyPublicJob(companyCode, jobId, dto, file);
  }
}
