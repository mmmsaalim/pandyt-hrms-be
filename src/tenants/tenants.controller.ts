import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto, TenantLeadStatusEnum } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateCompanyWithAdminDto } from './dto/create-company-with-admin.dto';
import { UpdateBillingSettingsDto } from './dto/update-billing-settings.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles('SUPER_ADMIN')
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('group') group?: 'active' | 'archived',
  ) {
    return this.tenantsService.findAll(page, limit, group);
  }

  @Get('payments/overview')
  @Roles('SUPER_ADMIN')
  paymentsOverview(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.tenantsService.paymentsOverview(page, limit);
  }

  @Post('payments/reminders/overdue')
  @Roles('SUPER_ADMIN')
  sendOverdueReminders() {
    return this.tenantsService.sendOverdueReminders();
  }

  @Post('payments/reminders/daily-run')
  @Roles('SUPER_ADMIN')
  runDailyBillingReminderSchedule() {
    return this.tenantsService.sendScheduledBillingReminders();
  }

  @Post('payments/:tenantId/reminder')
  @Roles('SUPER_ADMIN')
  sendTenantOverdueReminder(@Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.tenantsService.sendOverdueReminder(tenantId);
  }

  @Get('payments/:tenantId/settings')
  @Roles('SUPER_ADMIN')
  getTenantBillingSettings(@Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.tenantsService.getBillingSettings(tenantId);
  }

  @Patch('payments/:tenantId/settings')
  @Roles('SUPER_ADMIN')
  updateTenantBillingSettings(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() dto: UpdateBillingSettingsDto,
  ) {
    return this.tenantsService.upsertBillingSettings(tenantId, dto);
  }

  @Get('leads')
  @Roles('SUPER_ADMIN')
  leads(
    @Query('status', new ParseEnumPipe(TenantLeadStatusEnum, { optional: true }))
    status?: TenantLeadStatusEnum,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('group') group?: 'active' | 'archived',
  ) {
    return this.tenantsService.findLeads(status, page, limit, group);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN')
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Post('onboard')
  @Roles('SUPER_ADMIN')
  createCompanyWithAdminInvite(@Body() dto: CreateCompanyWithAdminDto) {
    return this.tenantsService.createCompanyWithAdminInvite(dto);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(id, dto);
  }

  @Patch(':id/approve')
  @Roles('SUPER_ADMIN')
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.approve(id);
  }

  @Patch(':id/deactivate-payment')
  @Roles('SUPER_ADMIN')
  deactivateForPayment(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.deactivateForPayment(id);
  }

  @Patch(':id/reactivate')
  @Roles('SUPER_ADMIN')
  reactivate(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.reactivate(id);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.remove(id);
  }
}
