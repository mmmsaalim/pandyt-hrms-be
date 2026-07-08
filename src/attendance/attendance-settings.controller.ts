import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { UpdateAttendanceSettingsDto } from './dto/attendance-settings.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule('attendance')
@Controller('attendance/settings')
export class AttendanceSettingsController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD', 'EMPLOYEE')
  @RequirePermissions('attendance.read')
  getSettings(@Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } }) {
    return this.attendanceService.getSettings(req.user);
  }

  @Patch()
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @RequirePermissions('attendance.read')
  updateSettings(
    @Body() dto: UpdateAttendanceSettingsDto,
    @Req() req: { user?: { sub: number; roles?: string[]; tenantId?: number } },
  ) {
    return this.attendanceService.updateSettings(dto, req.user);
  }
}
