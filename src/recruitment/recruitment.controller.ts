import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RecruitmentService } from './recruitment.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { CreateJobPostDto } from './dto/create-job-post.dto';
import { UpdateJobPostDto } from './dto/update-job-post.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

const RECRUITMENT_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER'] as const;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('recruitment')
export class RecruitmentController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  // --- Job Posts ---
  @Get('jobs')
  @Roles(...RECRUITMENT_ROLES)
  findAllJobs(@Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } }) {
    return this.recruitmentService.findAllJobs(req.user);
  }

  @Post('jobs')
  @Roles(...RECRUITMENT_ROLES)
  createJob(
    @Body() dto: CreateJobPostDto,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.recruitmentService.createJob(dto, req.user);
  }

  @Patch('jobs/:id')
  @Roles(...RECRUITMENT_ROLES)
  updateJob(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateJobPostDto,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.recruitmentService.updateJob(id, dto, req.user);
  }

  @Delete('jobs/:id')
  @Roles(...RECRUITMENT_ROLES)
  removeJob(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.recruitmentService.removeJob(id, req.user);
  }

  // --- Candidates ---
  @Get('candidates')
  @Roles(...RECRUITMENT_ROLES)
  findAllCandidates(
    @Query('jobPostId') jobPostId: string | undefined,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    const parsedJobPostId = jobPostId ? Number(jobPostId) : undefined;
    return this.recruitmentService.findAllCandidates(
      req.user,
      Number.isFinite(parsedJobPostId) ? parsedJobPostId : undefined,
    );
  }

  @Post('candidates')
  @Roles(...RECRUITMENT_ROLES)
  createCandidate(
    @Body() dto: CreateCandidateDto,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.recruitmentService.createCandidate(dto, req.user);
  }

  @Patch('candidates/:id')
  @Roles(...RECRUITMENT_ROLES)
  updateCandidate(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCandidateDto,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.recruitmentService.updateCandidate(id, dto, req.user);
  }

  @Delete('candidates/:id')
  @Roles(...RECRUITMENT_ROLES)
  removeCandidate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.recruitmentService.removeCandidate(id, req.user);
  }

  @Post('candidates/:id/resume')
  @Roles(...RECRUITMENT_ROLES)
  @UseInterceptors(
    FileInterceptor('resume', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadResume(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.recruitmentService.uploadResume(id, file, req.user);
  }

  @Get('pipeline/summary')
  @Roles(...RECRUITMENT_ROLES)
  pipelineSummary(@Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } }) {
    return this.recruitmentService.getPipelineSummary(req.user);
  }

  // Legacy routes (backward compatible)
  @Get()
  @Roles(...RECRUITMENT_ROLES)
  findAll(@Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } }) {
    return this.recruitmentService.findAll(req.user);
  }

  @Post()
  @Roles(...RECRUITMENT_ROLES)
  create(
    @Body() dto: CreateCandidateDto,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.recruitmentService.create(dto, req.user);
  }

  @Patch(':id')
  @Roles(...RECRUITMENT_ROLES)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCandidateDto,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.recruitmentService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles(...RECRUITMENT_ROLES)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number | null } },
  ) {
    return this.recruitmentService.remove(id, req.user);
  }
}
