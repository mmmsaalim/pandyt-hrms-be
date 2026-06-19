import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateFieldDefinitionDto } from './dto/create-field-definition.dto';
import { CreateModuleDefinitionDto } from './dto/create-module-definition.dto';
import { SaveTenantConfigurationDto } from './dto/save-tenant-configuration.dto';
import { SavePlatformBillingDto } from './dto/save-platform-billing.dto';
import { SavePlatformPlansDto } from './dto/save-platform-plans.dto';
import { TenantConfigurationService } from './tenant-configuration.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TenantConfigurationController {
  constructor(private readonly tenantConfigurationService: TenantConfigurationService) {}

  @Get('platform/modules')
  @Roles('SUPER_ADMIN')
  listPlatformModules() {
    return this.tenantConfigurationService.listPlatformModules();
  }

  @Get('platform/plans')
  listPlatformPlans() {
    return this.tenantConfigurationService.listPlatformPlans();
  }

  @Put('platform/plans')
  @Roles('SUPER_ADMIN')
  async savePlatformPlans(@Body() dto: SavePlatformPlansDto) {
    await this.tenantConfigurationService.savePlatformPlanCatalog(dto);
    return this.tenantConfigurationService.listPlatformPlans();
  }

  @Get('platform/billing')
  @Roles('SUPER_ADMIN')
  getPlatformBilling() {
    return this.tenantConfigurationService.getPlatformBillingConfig();
  }

  @Put('platform/billing')
  @Roles('SUPER_ADMIN')
  savePlatformBilling(@Body() dto: SavePlatformBillingDto) {
    return this.tenantConfigurationService.savePlatformBillingConfig(dto);
  }

  @Post('platform/modules')
  @Roles('SUPER_ADMIN')
  createPlatformModule(@Body() dto: CreateModuleDefinitionDto) {
    return this.tenantConfigurationService.createPlatformModule(dto);
  }

  @Get('platform/modules/:key/fields')
  @Roles('SUPER_ADMIN')
  listPlatformModuleFields(@Param('key') moduleKey: string) {
    return this.tenantConfigurationService.listPlatformModuleFields(moduleKey);
  }

  @Post('platform/modules/:key/fields')
  @Roles('SUPER_ADMIN')
  createPlatformField(@Param('key') moduleKey: string, @Body() dto: CreateFieldDefinitionDto) {
    return this.tenantConfigurationService.createPlatformField(moduleKey, dto);
  }

  @Get('tenants/:id/configuration')
  @Roles('SUPER_ADMIN')
  getTenantConfiguration(@Param('id') tenantId: string) {
    return this.tenantConfigurationService.getTenantConfigurationForAdmin(Number(tenantId));
  }

  @Put('tenants/:id/configuration')
  @Roles('SUPER_ADMIN')
  saveTenantConfiguration(@Param('id') tenantId: string, @Body() dto: SaveTenantConfigurationDto) {
    return this.tenantConfigurationService.saveTenantConfiguration(Number(tenantId), dto);
  }

  @Get('tenants/:id/configuration/preview')
  @Roles('SUPER_ADMIN')
  previewTenantConfiguration(@Param('id') tenantId: string) {
    return this.tenantConfigurationService.getTenantRuntimeConfig(Number(tenantId));
  }
}
