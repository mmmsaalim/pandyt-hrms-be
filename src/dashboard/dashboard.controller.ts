import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('super-admin')
  @Roles('SUPER_ADMIN')
  superAdmin() {
    return this.dashboardService.superAdminMetrics();
  }

  @Get('company-admin')
  @Roles('COMPANY_ADMIN')
  companyAdmin(
    @Req() req: { user?: { sub: number; roles?: string[] } },
    @Query('tenantId') tenantId?: number,
  ) {
    const user = req.user;
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    return this.dashboardService.companyAdminMetricsForUser(
      user.sub,
      user.roles ?? [],
      tenantId,
    );
  }

  @Get('employee/me')
  @Roles('EMPLOYEE')
  employeeSelf(@Req() req: { user?: { sub: number } }) {
    const user = req.user;
    if (!user?.sub) {
      throw new ForbiddenException('Unauthorized role access.');
    }

    return this.dashboardService.employeeMetricsByUser(user.sub);
  }

  @Get('employee/:employeeId')
  @Roles('COMPANY_ADMIN')
  employee(@Param('employeeId', ParseIntPipe) employeeId: number) {
    return this.dashboardService.employeeMetrics(employeeId);
  }
}
