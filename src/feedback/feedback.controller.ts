import { Body, Controller, ForbiddenException, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateFeedbackDto } from './dto/create-feedback.dto';
import { FeedbackService } from './feedback.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  private tenantId(req: { user?: { tenantId?: number | null } }): number {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }
    return tenantId;
  }

  @Get()
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD')
  list(@Req() req: { user?: { tenantId?: number | null } }) {
    return this.feedbackService.list(this.tenantId(req));
  }

  @Post()
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD')
  create(
    @Req() req: { user?: { sub?: number; tenantId?: number | null } },
    @Body() dto: CreateFeedbackDto,
  ) {
    return this.feedbackService.create(this.tenantId(req), req.user!.sub!, dto);
  }
}
