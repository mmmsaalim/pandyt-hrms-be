import { Body, Controller, ForbiddenException, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateFieldDefinitionDto } from './dto/create-field-definition.dto';
import { CreateModuleDefinitionDto } from './dto/create-module-definition.dto';
import { SaveTenantConfigurationDto } from './dto/save-tenant-configuration.dto';
import { SavePlatformBillingDto } from './dto/save-platform-billing.dto';
import { SavePlatformPlansDto } from './dto/save-platform-plans.dto';
import {
  CreateTenantCustomFieldDto,
  SaveCompanyAdminConfigurationDto,
} from './dto/save-company-admin-configuration.dto';
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

  @Get('tenant/configuration')
  @Roles('COMPANY_ADMIN')
  getOwnTenantConfiguration(@Req() req: { user?: { tenantId?: number | null } }) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }
    return this.tenantConfigurationService.getCompanyAdminConfiguration(tenantId);
  }

  @Put('tenant/configuration')
  @Roles('COMPANY_ADMIN')
  saveOwnTenantConfiguration(
    @Req() req: { user?: { tenantId?: number | null } },
    @Body() dto: SaveCompanyAdminConfigurationDto,
  ) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }
    return this.tenantConfigurationService.saveCompanyAdminConfiguration(tenantId, dto);
  }

  @Post('tenant/modules/:key/fields')
  @Roles('COMPANY_ADMIN')
  createTenantCustomField(
    @Req() req: { user?: { tenantId?: number | null } },
    @Param('key') moduleKey: string,
    @Body() dto: CreateTenantCustomFieldDto,
  ) {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Tenant context required');
    }
    return this.tenantConfigurationService.createTenantCustomField(tenantId, moduleKey, dto);
  }

  @Put('platform/plans')
  @Roles('SUPER_ADMIN')
  async savePlatformPlans(
    @Req() req: { user?: { sub?: number }; ip?: string },
    @Body() dto: SavePlatformPlansDto,
  ) {
    await this.tenantConfigurationService.savePlatformPlanCatalog(dto, {
      userId: req.user?.sub ?? 0,
      ipAddress: req.ip,
    });
    return this.tenantConfigurationService.listPlatformPlans();
  }

  @Get('platform/billing')
  @Roles('SUPER_ADMIN')
  getPlatformBilling() {
    return this.tenantConfigurationService.getPlatformBillingConfig();
  }

  @Put('platform/billing')
  @Roles('SUPER_ADMIN')
  savePlatformBilling(
    @Req() req: { user?: { sub?: number }; ip?: string },
    @Body() dto: SavePlatformBillingDto,
  ) {
    return this.tenantConfigurationService.savePlatformBillingConfig(dto, {
      userId: req.user?.sub ?? 0,
      ipAddress: req.ip,
    });
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
