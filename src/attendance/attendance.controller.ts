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
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  @Get()
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'EMPLOYEE')
  findAll(@Req() req: { user?: { sub: number; roles?: string[] } }) {
    return this.attendanceService.findAll(req.user);
  }

  @Post('clock-in')
  @Roles('EMPLOYEE', 'COMPANY_ADMIN')
  clockIn(@Req() req: { user?: { sub: number; roles?: string[] } }) {
    return this.attendanceService.clockIn(req.user);
  }

  @Post('clock-out')
  @Roles('EMPLOYEE', 'COMPANY_ADMIN')
  clockOut(@Req() req: { user?: { sub: number; roles?: string[] } }) {
    return this.attendanceService.clockOut(req.user);
  }

  @Post('override')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
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
  create(
    @Body() dto: CreateAttendanceDto,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.attendanceService.create(dto, req.user);
  }

  @Patch(':id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAttendanceDto,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.attendanceService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.attendanceService.remove(id, req.user);
  }
}
