import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
  @Roles('COMPANY_ADMIN', 'EMPLOYEE')
  findAll(@Req() req: { user?: { sub: string; roles?: string[] } }) {
    return this.attendanceService.findAll(req.user);
  }

  @Post()
  @Roles('COMPANY_ADMIN', 'EMPLOYEE')
  create(
    @Body() dto: CreateAttendanceDto,
    @Req() req: { user?: { sub: string; roles?: string[] } },
  ) {
    return this.attendanceService.create(dto, req.user);
  }

  @Patch(':id')
  @Roles('COMPANY_ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAttendanceDto,
    @Req() req: { user?: { sub: string; roles?: string[] } },
  ) {
    return this.attendanceService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('COMPANY_ADMIN')
  remove(
    @Param('id') id: string,
    @Req() req: { user?: { sub: string; roles?: string[] } },
  ) {
    return this.attendanceService.remove(id, req.user);
  }
}
