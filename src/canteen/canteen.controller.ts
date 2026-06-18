import { Body, Controller, Get, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CanteenService } from './canteen.service';
import { CanteenMealTypeConfig, MealBreakdown } from './canteen.constants';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule('canteen')
@Controller('canteen')
export class CanteenController {
  constructor(private readonly canteenService: CanteenService) {}

  @Get()
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD')
  @RequirePermissions('canteen.read')
  list(
    @Query('date') date: string | undefined,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.canteenService.list(date, req.user);
  }

  @Get('eligible')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD')
  @RequirePermissions('canteen.read')
  listEligible(
    @Query('date') date: string | undefined,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.canteenService.listEligibleEmployees(date, req.user);
  }

  @Get('settings')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD')
  @RequirePermissions('canteen.read')
  getSettings(@Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } }) {
    return this.canteenService.getSettings(req.user);
  }

  @Put('settings')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @RequirePermissions('canteen.manage')
  saveSettings(
    @Body()
    dto: {
      defaultMealCost?: number;
      salaryDeduct?: boolean;
      enabled?: boolean;
      notes?: string;
      autoAssignFromAttendance?: boolean;
      mealTypes?: CanteenMealTypeConfig[];
      defaultMealCounts?: Record<string, number>;
    },
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.canteenService.saveSettings(dto, req.user);
  }

  @Post('entries')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD')
  @RequirePermissions('canteen.manage')
  upsertEntry(
    @Body()
    dto: {
      employeeId: number;
      date: string;
      mealCount?: number;
      mealCost?: number;
      mealBreakdown?: MealBreakdown;
      deductFromSalary?: boolean;
      notes?: string;
    },
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.canteenService.upsertEntry(dto, req.user);
  }

  @Post('auto-generate')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD')
  @RequirePermissions('canteen.manage')
  autoGenerate(
    @Query('date') date: string | undefined,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.canteenService.autoGenerateEntries(date, req.user);
  }
}
