import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { LeaveService } from './leave.service';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { UpdateLeaveRequestDto } from './dto/update-leave-request.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { ModuleEnabledGuard } from '../common/guards/module-enabled.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';

@UseGuards(JwtAuthGuard, RolesGuard, ModuleEnabledGuard)
@RequireModule('leave')
@Controller('leave')
export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  @Get()
  @Roles('COMPANY_ADMIN', 'EMPLOYEE', 'HR_MANAGER', 'TEAM_LEAD')
  findAll(@Req() req: { user?: { sub: number; roles?: string[] } }) {
    return this.leaveService.findAll(req.user);
  }

  // --- Leave Policies ---
  @Get('presets')
  @Roles('SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER')
  getPresets() {
    return this.leaveService.getLeavePresets();
  }

  @Get('policies')
  @Roles('COMPANY_ADMIN', 'EMPLOYEE', 'HR_MANAGER', 'TEAM_LEAD')
  findAllPolicies(@Req() req: { user?: { sub: number; roles?: string[] } }) {
    return this.leaveService.findAllPolicies(req.user);
  }

  @Post('policies')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  createPolicy(
    @Body() dto: { name: string; days: number; carryForwardLimit?: number; accrualRate?: number },
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.leaveService.createPolicy(dto, req.user);
  }

  // --- Leave Balances ---
  @Get('balances')
  @Roles('COMPANY_ADMIN', 'EMPLOYEE', 'HR_MANAGER', 'TEAM_LEAD')
  getBalances(
    @Query('employeeId') employeeIdStr: string | undefined,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    const employeeId = employeeIdStr ? Number(employeeIdStr) : undefined;
    return this.leaveService.getBalances(employeeId, req.user);
  }

  // --- Accrual Engine ---
  @Post('accrual')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER')
  runAccrual(@Req() req: { user?: { sub: number; roles?: string[] } }) {
    return this.leaveService.runAccrual(req.user);
  }

  @Get('calculate-days')
  @Roles('COMPANY_ADMIN', 'EMPLOYEE', 'HR_MANAGER', 'TEAM_LEAD')
  calculateDays(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.leaveService.calculateWorkingDays(startDate, endDate, req.user);
  }

  @Post()
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD', 'EMPLOYEE')
  create(
    @Body() dto: CreateLeaveRequestDto,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.leaveService.create(dto, req.user);
  }

  @Patch(':id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLeaveRequestDto,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.leaveService.update(id, dto, req.user);
  }

  @Delete(':id')
  @Roles('COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD', 'EMPLOYEE')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: { user?: { sub: number; roles?: string[] } },
  ) {
    return this.leaveService.remove(id, req.user);
  }
}
