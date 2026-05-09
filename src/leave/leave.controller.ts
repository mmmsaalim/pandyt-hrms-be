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
import { LeaveService } from './leave.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get()
  @Roles('COMPANY_ADMIN', 'EMPLOYEE')
  findAll(@Req() req: { user?: { sub: string; roles?: string[] } }) {
    return this.leaveService.findAll(req.user);
  }

  @Post()
  @Roles('COMPANY_ADMIN', 'EMPLOYEE')
  create(
    @Body() dto: CreateLeaveRequestDto,
    @Req() req: { user?: { sub: string; roles?: string[] } },
  ) {
    return this.leaveService.create(dto, req.user);
  }

  @Patch(':id')
  @Roles('COMPANY_ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLeaveRequestDto,
    @Req() req: { user?: { sub: string; roles?: string[] } },
  ) {
    return this.leaveService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('COMPANY_ADMIN')
  remove(
    @Param('id') id: string,
    @Req() req: { user?: { sub: string; roles?: string[] } },
  ) {
    return this.leaveService.remove(id, req.user);
  }
}
