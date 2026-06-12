import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobPostStatus, PipelineStage, Prisma } from '@prisma/client';
import { mkdir, writeFile } from 'fs/promises';
import { join, extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { CreateJobPostDto } from './dto/create-job-post.dto';
import { PublicApplyJobDto } from './dto/public-apply-job.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { UpdateJobPostDto } from './dto/update-job-post.dto';

type RequestUser = { sub: number; roles?: string[]; tenantId?: number | null } | undefined;

const ALLOWED_RESUME_EXTENSIONS = new Set(['.pdf', '.doc', '.docx']);
const MAX_RESUME_BYTES = 10 * 1024 * 1024;

@Injectable()
export class RecruitmentService {
  constructor(private readonly prisma: PrismaService) {}

  private requireTenant(user: RequestUser): number {
    const tenantId = user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context is required.');
    }
    return tenantId;
  }

  private async ensureJobPost(tenantId: number, jobPostId: number) {
    const job = await this.prisma.jobPost.findFirst({
      where: { id: jobPostId, tenantId },
    });
    if (!job) {
      throw new NotFoundException('Job post not found in this tenant.');
    }
    return job;
  }

  private async ensureCandidate(tenantId: number, id: number) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id, tenantId },
      include: { jobPost: true },
    });
    if (!candidate) {
      throw new NotFoundException('Candidate not found.');
    }
    return candidate;
  }

  private async resolvePublicTenant(companyCode: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: {
        companyCode: companyCode.trim().toLowerCase(),
        status: 'ACTIVE',
      },
      select: { id: true, name: true, companyCode: true },
    });

    if (!tenant) {
      throw new NotFoundException('Company careers page not found.');
    }

    return tenant;
  }

  private async storeResumeFile(tenantId: number, candidateId: number, file: Express.Multer.File) {
    if (file.size > MAX_RESUME_BYTES) {
      throw new BadRequestException('Resume file must be 10MB or smaller.');
    }

    const extension = extname(file.originalname).toLowerCase();
    if (!ALLOWED_RESUME_EXTENSIONS.has(extension)) {
      throw new BadRequestException('Only PDF and DOCX resume files are allowed.');
    }

    const uploadDir = join(process.cwd(), 'uploads', 'resumes', String(tenantId));
    await mkdir(uploadDir, { recursive: true });

    const safeName = `candidate-${candidateId}-${Date.now()}${extension}`;
    const absolutePath = join(uploadDir, safeName);
    await writeFile(absolutePath, file.buffer);

    return {
      resumeUrl: `/uploads/resumes/${tenantId}/${safeName}`,
      resumeFileName: file.originalname,
    };
  }

  // --- Job Posts ---
  findAllJobs(user: RequestUser) {
    const tenantId = this.requireTenant(user);
    return this.prisma.jobPost.findMany({
      where: { tenantId },
      include: {
        _count: { select: { candidates: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createJob(dto: CreateJobPostDto, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    const status = dto.status ?? JobPostStatus.DRAFT;

    return this.prisma.jobPost.create({
      data: {
        tenantId,
        title: dto.title,
        department: dto.department,
        description: dto.description,
        requiredSkills: dto.requiredSkills ?? [],
        status,
        openedAt: status === JobPostStatus.OPEN ? new Date() : undefined,
      },
    });
  }

  async updateJob(id: number, dto: UpdateJobPostDto, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    const existing = await this.prisma.jobPost.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Job post not found.');

    const data: Prisma.JobPostUpdateInput = { ...dto };

    if (dto.status === JobPostStatus.OPEN && existing.status !== JobPostStatus.OPEN) {
      data.openedAt = new Date();
      data.closedAt = null;
    }

    if (dto.status === JobPostStatus.CLOSED && existing.status !== JobPostStatus.CLOSED) {
      data.closedAt = new Date();
    }

    return this.prisma.jobPost.update({ where: { id }, data });
  }

  async removeJob(id: number, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    const existing = await this.prisma.jobPost.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Job post not found.');

    const activeCandidates = await this.prisma.candidate.count({
      where: {
        tenantId,
        jobPostId: id,
        stage: { notIn: [PipelineStage.HIRED, PipelineStage.REJECTED] },
      },
    });

    if (activeCandidates > 0) {
      throw new BadRequestException(
        'Cannot delete job post while active candidates are still in the pipeline.',
      );
    }

    return this.prisma.jobPost.delete({ where: { id } });
  }

  // --- Candidates ---
  findAllCandidates(user: RequestUser, jobPostId?: number) {
    const tenantId = this.requireTenant(user);
    return this.prisma.candidate.findMany({
      where: {
        tenantId,
        ...(jobPostId ? { jobPostId } : {}),
      },
      include: { jobPost: { select: { id: true, title: true, status: true } } },
      orderBy: { appliedAt: 'desc' },
    });
  }

  async createCandidate(dto: CreateCandidateDto, user: RequestUser) {
    const tenantId = this.requireTenant(user);

    if (dto.jobPostId) {
      await this.ensureJobPost(tenantId, dto.jobPostId);
    }

    return this.prisma.candidate.create({
      data: {
        tenantId,
        name: dto.name,
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone,
        jobPostId: dto.jobPostId,
        roleApplied: dto.roleApplied,
        source: dto.source,
        stage: dto.stage ?? PipelineStage.APPLIED,
        rating: dto.rating ?? 0,
        notes: dto.notes,
      },
      include: { jobPost: { select: { id: true, title: true } } },
    });
  }

  async updateCandidate(id: number, dto: UpdateCandidateDto, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    await this.ensureCandidate(tenantId, id);

    if (dto.jobPostId) {
      await this.ensureJobPost(tenantId, dto.jobPostId);
    }

    return this.prisma.candidate.update({
      where: { id },
      data: dto,
      include: { jobPost: { select: { id: true, title: true } } },
    });
  }

  async removeCandidate(id: number, user: RequestUser) {
    const tenantId = this.requireTenant(user);
    await this.ensureCandidate(tenantId, id);
    return this.prisma.candidate.delete({ where: { id } });
  }

  getPipelineSummary(user: RequestUser) {
    const tenantId = this.requireTenant(user);
    return this.prisma.candidate.groupBy({
      by: ['stage'],
      where: { tenantId },
      _count: { stage: true },
    });
  }

  // --- Resume upload stub (AI parsing deferred) ---
  async uploadResume(
    id: number,
    file: Express.Multer.File | undefined,
    user: RequestUser,
  ) {
    const tenantId = this.requireTenant(user);
    await this.ensureCandidate(tenantId, id);

    if (!file) {
      throw new BadRequestException('Resume file is required.');
    }

    const resume = await this.storeResumeFile(tenantId, id, file);

    const updated = await this.prisma.candidate.update({
      where: { id },
      data: {
        resumeUrl: resume.resumeUrl,
        resumeFileName: resume.resumeFileName,
      },
      include: { jobPost: { select: { id: true, title: true } } },
    });

    return {
      candidate: updated,
      resumeUrl: resume.resumeUrl,
      parsingStatus: 'STORED',
      message: 'Resume stored successfully. AI parsing is not enabled yet.',
    };
  }

  // --- Public careers / external candidate apply ---
  async findPublicOpenJobs(companyCode: string) {
    const tenant = await this.resolvePublicTenant(companyCode);
    const jobs = await this.prisma.jobPost.findMany({
      where: {
        tenantId: tenant.id,
        status: JobPostStatus.OPEN,
      },
      select: {
        id: true,
        title: true,
        department: true,
        description: true,
        requiredSkills: true,
        openedAt: true,
      },
      orderBy: { openedAt: 'desc' },
    });

    return { company: tenant, jobs };
  }

  async applyPublicJob(
    companyCode: string,
    jobId: number,
    dto: PublicApplyJobDto,
    file: Express.Multer.File | undefined,
  ) {
    const tenant = await this.resolvePublicTenant(companyCode);
    const job = await this.prisma.jobPost.findFirst({
      where: {
        id: jobId,
        tenantId: tenant.id,
        status: JobPostStatus.OPEN,
      },
      select: { id: true, title: true },
    });

    if (!job) {
      throw new NotFoundException('Open job post not found.');
    }

    if (!file) {
      throw new BadRequestException('Resume file is required.');
    }

    const candidate = await this.prisma.candidate.create({
      data: {
        tenantId: tenant.id,
        jobPostId: job.id,
        name: dto.name,
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone,
        roleApplied: job.title,
        source: 'Career Page',
        stage: PipelineStage.APPLIED,
        rating: 0,
        notes: dto.coverLetter,
      },
      include: { jobPost: { select: { id: true, title: true } } },
    });

    const resume = await this.storeResumeFile(tenant.id, candidate.id, file);
    const updated = await this.prisma.candidate.update({
      where: { id: candidate.id },
      data: {
        resumeUrl: resume.resumeUrl,
        resumeFileName: resume.resumeFileName,
      },
      include: { jobPost: { select: { id: true, title: true } } },
    });

    return {
      candidate: updated,
      parsingStatus: 'STORED',
      message: 'Application submitted successfully. HR will review your CV.',
    };
  }

  // Legacy aliases
  findAll(user: RequestUser) {
    return this.findAllCandidates(user);
  }

  create(dto: CreateCandidateDto, user: RequestUser) {
    return this.createCandidate(dto, user);
  }

  update(id: number, dto: UpdateCandidateDto, user: RequestUser) {
    return this.updateCandidate(id, dto, user);
  }

  remove(id: number, user: RequestUser) {
    return this.removeCandidate(id, user);
  }
}
