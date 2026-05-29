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

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get()
  @Roles('SUPER_ADMIN')
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get('payments/overview')
  @Roles('SUPER_ADMIN')
  paymentsOverview() {
    return this.tenantsService.paymentsOverview();
  }

  @Get('leads')
  @Roles('SUPER_ADMIN')
  leads(
    @Query('status', new ParseEnumPipe(TenantLeadStatusEnum, { optional: true }))
    status?: TenantLeadStatusEnum,
  ) {
    return this.tenantsService.findLeads(status);
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

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.tenantsService.remove(id);
  }
}
