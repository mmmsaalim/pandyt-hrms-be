import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';

@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule('attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'EMPLOYEE')
  @RequirePermissions('attendance.read')
  findAll(@Req() req: { user?: { sub: number; roles?: string[] } }) {
    return this.attendanceService.findAll(req.user);
  }

  @Post('clock-in')
  @Roles('EMPLOYEE', 'COMPANY_ADMIN')
  @RequirePermissions('attendance.read')
  clockIn(@Req() req: { user?: { sub: number; roles?: string[] } }) {
    return this.attendanceService.clockIn(req.user);
  }

  @Post('clock-out')
  @Roles('EMPLOYEE', 'COMPANY_ADMIN')
  @RequirePermissions('attendance.read')
  clockOut(@Req() req: { user?: { sub: number; roles?: string[] } }) {
    return this.attendanceService.clockOut(req.user);
  }

  @Post('override')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @RequirePermissions('attendance.read')
  override(
    @Body()
    dto: {
      employeeId: number;
      date: string;
      clockIn?: string;
      clockOut?: string;
      reason: string;
    },
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.attendanceService.override(dto, req.user);
  }

  @Post()
  @Roles('COMPANY_ADMIN', 'EMPLOYEE')
  @RequirePermissions('attendance.read')
  create(
    @Body() dto: CreateAttendanceDto,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.attendanceService.create(dto, req.user);
  }

  @Patch(':id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @RequirePermissions('attendance.read')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceDto,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.attendanceService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  @RequirePermissions('attendance.read')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.attendanceService.remove(id, req.user);
  }
}
