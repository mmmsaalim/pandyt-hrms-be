import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RecruitmentService } from './recruitment.service';
import { CreateCandidateDto } from './dto/create-candidate.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('recruitment')
export class RecruitmentController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  @Get()
  @Roles('COMPANY_ADMIN')
  findAll(@Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } }) {
    return this.recruitmentService.findAll(req.user);
  }

  @Post()
  @Roles('COMPANY_ADMIN')
  create(
    @Body() dto: CreateCandidateDto,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.recruitmentService.create(dto, req.user);
  }

  @Patch(':id')
  @Roles('COMPANY_ADMIN')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCandidateDto,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.recruitmentService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('COMPANY_ADMIN')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.recruitmentService.remove(id, req.user);
  }
}
