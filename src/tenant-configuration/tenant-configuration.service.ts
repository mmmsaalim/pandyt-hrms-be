import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LeaveService } from '../leave/leave.service';
import { LeaveSetupConfig } from '../leave/leave.constants';
import { DEFAULT_PAYSLIP_TEMPLATE_KEY } from '../payroll/payslip.constants';
import { CreateFieldDefinitionDto } from './dto/create-field-definition.dto';
import { CreateModuleDefinitionDto } from './dto/create-module-definition.dto';
import { SaveTenantConfigurationDto } from './dto/save-tenant-configuration.dto';
import {
  ALL_BUSINESS_MODULE_KEYS,
  PLATFORM_MODULE_CATALOG,
  DEFAULT_PLATFORM_BILLING,
  DEFAULT_TENANT_CONFIG,
  DEFAULT_EMPLOYEE_PROFILE_FIELDS,
  PLAN_CATALOG,
  PLATFORM_BILLING_KEY,
  PLATFORM_PLANS_KEY,
  PlatformBillingConfig,
  PlatformPlanCatalogConfig,
  PlatformPlanCatalogEntry,
  modulesForPlan,
  normalizePlan,
  isUnlimitedPlan,
  permissionToModule,
  resolveSeatsForPlan,
  seatsForPlan,
} from './tenant-configuration.constants';
import { SavePlatformBillingDto } from './dto/save-platform-billing.dto';
import { SavePlatformPlansDto } from './dto/save-platform-plans.dto';

export type TenantFieldRuntimeConfig = {
  fieldKey: string;
  label: string;
  fieldType: string;
  options: unknown;
  enabled: boolean;
  required: boolean;
  sortOrder: number;
  isSystem: boolean;
};

export type TenantRuntimeConfig = {
  plan: string;
  enabledModules: string[];
  fieldsByModule: Record<string, TenantFieldRuntimeConfig[]>;
  config: {
    locale: string;
    currency: string;
    fiscalYearStartMonth: number;
  };
};

type TxClient = Prisma.TransactionClient;

@Injectable()
export class TenantConfigurationService {
  private planCatalogCache: PlatformPlanCatalogEntry[] | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => LeaveService))
    private readonly leaveService: LeaveService,
  ) {}

  getEffectivePermissions(userPermissions: string[], enabledModules: string[]): string[] {
    const enabled = new Set(enabledModules);
    return userPermissions.filter((permission) => {
      const module = permissionToModule(permission);
      // Company Admin RBAC screen is always available; not a billable tenant module toggle.
      if (module === 'configuration') {
        return true;
      }
      return enabled.has(module);
    });
  }

  /** Assigning a tenant module role (e.g. ATTENDANCE) grants read access to that module. */
  expandModuleRoleReadAccess(
    userPermissions: string[],
    roleNames: string[],
    enabledModules: string[],
  ): string[] {
    const enabled = new Set(enabledModules);
    const merged = new Set(userPermissions);

    for (const roleName of roleNames) {
      const moduleKey = roleName.trim().toLowerCase();
      if (enabled.has(moduleKey)) {
        merged.add(`${moduleKey}.read`);
      }
    }

    return Array.from(merged);
  }

  async getEnabledModuleKeys(tenantId: number): Promise<string[]> {
    const rows = await this.prisma.tenantModuleSetting.findMany({
      where: { tenantId, enabled: true },
      select: { moduleKey: true },
      orderBy: { moduleKey: 'asc' },
    });

    if (rows.length === 0) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true },
      });

      if (!tenant) {
        return [];
      }

      return this.resolvePlanModules(tenant.plan);
    }

    return rows.map((row) => row.moduleKey);
  }

  async isModuleEnabled(tenantId: number, moduleKey: string): Promise<boolean> {
    const enabledModules = await this.getEnabledModuleKeys(tenantId);
    return enabledModules.includes(moduleKey);
  }

  async getTenantRuntimeConfig(tenantId: number): Promise<TenantRuntimeConfig> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true, config: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    const enabledModules = await this.getEnabledModuleKeys(tenantId);
    const fieldDefinitions = await this.prisma.fieldDefinition.findMany({
      where: {
        isActive: true,
        moduleKey: { in: enabledModules },
      },
      orderBy: [{ moduleKey: 'asc' }, { id: 'asc' }],
    });

    const tenantFieldSettings = await this.prisma.tenantFieldSetting.findMany({
      where: { tenantId, moduleKey: { in: enabledModules } },
    });

    const settingMap = new Map(
      tenantFieldSettings.map((row) => [`${row.moduleKey}:${row.fieldKey}`, row]),
    );

    const fieldsByModule: Record<string, TenantFieldRuntimeConfig[]> = {};

    for (const field of fieldDefinitions) {
      const setting = settingMap.get(`${field.moduleKey}:${field.fieldKey}`);
      const enabled = setting?.enabled ?? false;
      if (!enabled) {
        continue;
      }

      const runtimeField: TenantFieldRuntimeConfig = {
        fieldKey: field.fieldKey,
        label: field.label,
        fieldType: field.fieldType,
        options: field.options,
        enabled,
        required: setting?.required ?? false,
        sortOrder: setting?.sortOrder ?? 0,
        isSystem: field.isSystem,
      };

      fieldsByModule[field.moduleKey] = [...(fieldsByModule[field.moduleKey] ?? []), runtimeField];
    }

    for (const moduleKey of Object.keys(fieldsByModule)) {
      fieldsByModule[moduleKey].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
    }

    const rawConfig = (tenant.config ?? {}) as Record<string, unknown>;

    return {
      plan: tenant.plan,
      enabledModules,
      fieldsByModule,
      config: this.normalizeTenantConfig(rawConfig),
    };
  }

  private normalizeTenantConfig(rawConfig: Record<string, unknown>) {
    const leaveSetupRaw = rawConfig.leaveSetup;
    const leaveSetup: Prisma.InputJsonValue =
      leaveSetupRaw && typeof leaveSetupRaw === 'object' && !Array.isArray(leaveSetupRaw)
        ? (leaveSetupRaw as Prisma.InputJsonValue)
        : (DEFAULT_TENANT_CONFIG.leaveSetup as Prisma.InputJsonValue);

    return {
      locale: typeof rawConfig.locale === 'string' ? rawConfig.locale : DEFAULT_TENANT_CONFIG.locale,
      currency:
        typeof rawConfig.currency === 'string' ? rawConfig.currency : DEFAULT_TENANT_CONFIG.currency,
      fiscalYearStartMonth:
        typeof rawConfig.fiscalYearStartMonth === 'number'
          ? rawConfig.fiscalYearStartMonth
          : DEFAULT_TENANT_CONFIG.fiscalYearStartMonth,
      payslipTemplateKey:
        typeof rawConfig.payslipTemplateKey === 'string'
          ? rawConfig.payslipTemplateKey
          : DEFAULT_TENANT_CONFIG.payslipTemplateKey ?? DEFAULT_PAYSLIP_TEMPLATE_KEY,
      leaveSetup,
    } satisfies Record<string, Prisma.InputJsonValue>;
  }

  async getTenantConfigurationForAdmin(tenantId: number) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        plan: true,
        seats: true,
        config: true,
        moduleSettings: true,
        fieldSettings: true,
      },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    await this.ensurePlatformModuleCatalog();

    const [modules, fields] = await Promise.all([
      this.prisma.moduleDefinition.findMany({
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        include: {
          fields: {
            where: { isActive: true },
            orderBy: { fieldKey: 'asc' },
          },
        },
      }),
      Promise.resolve(tenant.fieldSettings),
    ]);

    const enabledModuleMap = new Map(
      tenant.moduleSettings.map((row) => [row.moduleKey, row.enabled]),
    );
    const fieldSettingMap = new Map(
      fields.map((row) => [`${row.moduleKey}:${row.fieldKey}`, row]),
    );

    const planModules = await this.resolvePlanModules(tenant.plan);

    return {
      tenantId: tenant.id,
      plan: tenant.plan,
      seats: tenant.seats,
      planSeatLimit: await this.resolvePlanSeatLimit(tenant.plan),
      planDefaultModules: planModules,
      config: this.normalizeTenantConfig((tenant.config ?? {}) as Record<string, unknown>),
      modules: modules.map((module) => ({
        key: module.key,
        label: module.label,
        description: module.description,
        enabled: enabledModuleMap.get(module.key) ?? planModules.includes(module.key as never),
        fields: module.fields.map((field) => {
          const setting = fieldSettingMap.get(`${module.key}:${field.fieldKey}`);
          return {
            fieldKey: field.fieldKey,
            label: field.label,
            fieldType: field.fieldType,
            options: field.options,
            isSystem: field.isSystem,
            enabled: setting?.enabled ?? false,
            required: setting?.required ?? false,
            sortOrder: setting?.sortOrder ?? 0,
          };
        }),
      })),
    };
  }

  async saveTenantConfiguration(tenantId: number, dto: SaveTenantConfigurationDto) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, plan: true, config: true },
    });

    if (!tenant) {
      throw new NotFoundException('Tenant not found.');
    }

    const nextPlan = dto.plan ? normalizePlan(dto.plan) : normalizePlan(tenant.plan);
    const planDefaultModules = await this.resolvePlanModules(nextPlan);
    const requestedModules = dto.enabledModules?.length
      ? dto.enabledModules.map((key) => key.trim().toLowerCase())
      : planDefaultModules;

    const invalidModules = requestedModules.filter(
      (key) => !ALL_BUSINESS_MODULE_KEYS.includes(key as (typeof ALL_BUSINESS_MODULE_KEYS)[number]),
    );

    if (invalidModules.length > 0) {
      throw new BadRequestException(`Invalid module keys: ${invalidModules.join(', ')}`);
    }

    // Plan presets are defaults only — Super Admin may enable modules beyond the plan tier.

    const existingConfig = (tenant.config ?? {}) as Record<string, unknown>;
    const normalizedExisting = this.normalizeTenantConfig(existingConfig);
    const nextConfig = {
      locale: dto.config?.locale ?? normalizedExisting.locale,
      currency: dto.config?.currency ?? normalizedExisting.currency,
      fiscalYearStartMonth:
        dto.config?.fiscalYearStartMonth ?? normalizedExisting.fiscalYearStartMonth,
      payslipTemplateKey:
        dto.config?.payslipTemplateKey ?? normalizedExisting.payslipTemplateKey,
      leaveSetup: dto.config?.leaveSetup ?? normalizedExisting.leaveSetup,
    } satisfies Record<string, Prisma.InputJsonValue>;

    await this.prisma.$transaction(async (tx) => {
      await tx.tenant.update({
        where: { id: tenantId },
        data: {
          plan: nextPlan,
          seats: resolveSeatsForPlan(nextPlan),
          config: nextConfig as Prisma.InputJsonValue,
        },
      });

      await this.persistModuleSettings(tx, tenantId, requestedModules);
      await this.persistFieldSettings(tx, tenantId, dto.moduleFeatures ?? {}, requestedModules);
    });

    if (requestedModules.includes('leave') && dto.config?.leaveSetup) {
      await this.leaveService.seedPoliciesForTenant(
        tenantId,
        dto.config.leaveSetup as LeaveSetupConfig,
        { onlyIfEmpty: false },
      );
    }

    return this.getTenantConfigurationForAdmin(tenantId);
  }

  async applyDefaultConfigurationForTenant(
    tenantId: number,
    plan: string,
    overrides?: Partial<SaveTenantConfigurationDto>,
  ) {
    const normalizedPlan = normalizePlan(plan);
    const enabledModules = overrides?.enabledModules?.length
      ? overrides.enabledModules
      : await this.resolvePlanModules(normalizedPlan);

    return this.saveTenantConfiguration(tenantId, {
      plan: normalizedPlan,
      enabledModules,
      moduleFeatures: overrides?.moduleFeatures,
      config: overrides?.config,
    });
  }

  async persistModuleSettings(tx: TxClient, tenantId: number, enabledModules: string[]) {
    const moduleKeys = [...ALL_BUSINESS_MODULE_KEYS];

    for (const moduleKey of moduleKeys) {
      await tx.tenantModuleSetting.upsert({
        where: {
          tenantId_moduleKey: {
            tenantId,
            moduleKey,
          },
        },
        update: {
          enabled: enabledModules.includes(moduleKey),
        },
        create: {
          tenantId,
          moduleKey,
          enabled: enabledModules.includes(moduleKey),
        },
      });
    }
  }

  async persistFieldSettings(
    tx: TxClient,
    tenantId: number,
    moduleFeatures: Record<string, Record<string, { enabled?: boolean; required?: boolean; sortOrder?: number }>>,
    enabledModules: string[],
  ) {
    const activeDefinitions = await tx.fieldDefinition.findMany({
      where: {
        isActive: true,
        moduleKey: { in: enabledModules },
      },
    });

    for (const definition of activeDefinitions) {
      const moduleFeaturesForModule = moduleFeatures[definition.moduleKey] ?? {};
      const feature = moduleFeaturesForModule[definition.fieldKey];
      const enabled = feature?.enabled ?? definition.isSystem;
      const required = feature?.required ?? false;
      const sortOrder = feature?.sortOrder ?? 0;

      await tx.tenantFieldSetting.upsert({
        where: {
          tenantId_moduleKey_fieldKey: {
            tenantId,
            moduleKey: definition.moduleKey,
            fieldKey: definition.fieldKey,
          },
        },
        update: {
          enabled,
          required,
          sortOrder,
        },
        create: {
          tenantId,
          moduleKey: definition.moduleKey,
          fieldKey: definition.fieldKey,
          enabled,
          required,
          sortOrder,
        },
      });
    }

    await tx.tenantFieldSetting.updateMany({
      where: {
        tenantId,
        moduleKey: { notIn: enabledModules },
      },
      data: { enabled: false },
    });
  }

  validateCustomFields(
    runtimeConfig: TenantRuntimeConfig,
    moduleKey: string,
    customFields: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    const allowedFields = runtimeConfig.fieldsByModule[moduleKey] ?? [];
    const allowedMap = new Map(allowedFields.map((field) => [field.fieldKey, field]));
    const input = customFields ?? {};
    const output: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input)) {
      if (!allowedMap.has(key)) {
        throw new BadRequestException(`Field "${key}" is not enabled for this tenant.`);
      }

      output[key] = value;
    }

    for (const field of allowedFields) {
      if (field.required && (output[field.fieldKey] === undefined || output[field.fieldKey] === '')) {
        throw new BadRequestException(`Field "${field.label}" is required.`);
      }
    }

    return output;
  }

  filterCustomFieldsForRead(
    runtimeConfig: TenantRuntimeConfig,
    moduleKey: string,
    customFields: unknown,
  ): Record<string, unknown> {
    const allowedKeys = new Set(
      (runtimeConfig.fieldsByModule[moduleKey] ?? []).map((field) => field.fieldKey),
    );
    const input =
      customFields && typeof customFields === 'object' && !Array.isArray(customFields)
        ? (customFields as Record<string, unknown>)
        : {};

    return Object.fromEntries(Object.entries(input).filter(([key]) => allowedKeys.has(key)));
  }

  async ensurePlatformModuleCatalog() {
    for (const module of PLATFORM_MODULE_CATALOG) {
      await this.prisma.moduleDefinition.upsert({
        where: { key: module.key },
        update: {
          label: module.label,
          sortOrder: module.sortOrder,
          isActive: true,
        },
        create: {
          key: module.key,
          label: module.label,
          sortOrder: module.sortOrder,
          isActive: true,
        },
      });
    }
  }

  async listPlatformModules() {
    await this.ensurePlatformModuleCatalog();

    return this.prisma.moduleDefinition.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      include: {
        fields: {
          where: { isActive: true },
          orderBy: { fieldKey: 'asc' },
        },
      },
    });
  }

  buildDefaultPlanCatalog(): PlatformPlanCatalogEntry[] {
    return PLAN_CATALOG.map((plan, index) => ({
      key: plan.key,
      label: plan.label,
      seats: plan.seats,
      priceLkr: plan.priceLkr,
      description: plan.description,
      defaultModules: [...modulesForPlan(plan.key)],
      sortOrder: index + 1,
      isActive: true,
    }));
  }

  private normalizePlanCatalogEntry(raw: Partial<PlatformPlanCatalogEntry>, index: number): PlatformPlanCatalogEntry | null {
    const key = normalizePlan(String(raw.key ?? ''));
    if (!key) {
      return null;
    }

    const defaultModules = Array.isArray(raw.defaultModules)
      ? raw.defaultModules.map((moduleKey) => moduleKey.trim().toLowerCase()).filter(Boolean)
      : modulesForPlan(key);

    return {
      key,
      label: String(raw.label ?? key).trim() || key,
      seats: raw.seats === null ? null : typeof raw.seats === 'number' ? raw.seats : seatsForPlan(key),
      priceLkr: raw.priceLkr === null ? null : typeof raw.priceLkr === 'number' ? raw.priceLkr : null,
      description: String(raw.description ?? '').trim(),
      defaultModules,
      sortOrder: typeof raw.sortOrder === 'number' ? raw.sortOrder : index + 1,
      isActive: raw.isActive !== false,
    };
  }

  async getPlatformPlanCatalog(forceRefresh = false): Promise<PlatformPlanCatalogEntry[]> {
    if (!forceRefresh && this.planCatalogCache) {
      return this.planCatalogCache;
    }

    const row = await this.prisma.platformSetting.findUnique({
      where: { key: PLATFORM_PLANS_KEY },
    });

    if (row?.value && typeof row.value === 'object' && !Array.isArray(row.value)) {
      const stored = row.value as PlatformPlanCatalogConfig;
      if (Array.isArray(stored.plans) && stored.plans.length) {
        this.planCatalogCache = stored.plans
          .map((plan, index) => this.normalizePlanCatalogEntry(plan, index))
          .filter((plan): plan is PlatformPlanCatalogEntry => plan !== null)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        return this.planCatalogCache;
      }
    }

    const defaults = this.buildDefaultPlanCatalog();
    await this.prisma.platformSetting.upsert({
      where: { key: PLATFORM_PLANS_KEY },
      update: {},
      create: {
        key: PLATFORM_PLANS_KEY,
        value: { plans: defaults } as unknown as Prisma.InputJsonValue,
      },
    });

    this.planCatalogCache = defaults;
    return defaults;
  }

  planLabelFromCatalog(catalog: PlatformPlanCatalogEntry[], plan: string): string {
    const normalized = normalizePlan(plan);
    return catalog.find((entry) => entry.key === normalized)?.label ?? plan.trim();
  }

  async resolvePlanLabel(plan: string): Promise<string> {
    const catalog = await this.getPlatformPlanCatalog();
    return this.planLabelFromCatalog(catalog, plan);
  }

  async resolvePlanModules(plan: string): Promise<string[]> {
    const catalog = await this.getPlatformPlanCatalog();
    const normalized = normalizePlan(plan);
    const match = catalog.find((entry) => entry.key === normalized && entry.isActive);
    if (match?.defaultModules?.length) {
      return match.defaultModules;
    }
    return modulesForPlan(plan);
  }

  async resolvePlanSeatLimit(plan: string): Promise<number> {
    const catalog = await this.getPlatformPlanCatalog();
    const normalized = normalizePlan(plan);
    const match = catalog.find((entry) => entry.key === normalized && entry.isActive);
    if (match?.seats === null) {
      return 999999;
    }
    if (typeof match?.seats === 'number') {
      return match.seats;
    }
    return seatsForPlan(plan);
  }

  async listPlatformPlans() {
    const [catalog, billing] = await Promise.all([
      this.getPlatformPlanCatalog(),
      this.getPlatformBillingConfig(),
    ]);

    return catalog
      .filter((plan) => plan.isActive)
      .map((plan) => ({
        key: plan.key,
        label: plan.label,
        seats: billing.plans[plan.key]?.seats ?? plan.seats,
        priceLkr: billing.plans[plan.key]?.monthlyPriceLkr ?? plan.priceLkr,
        description: plan.description,
        defaultModules: plan.defaultModules,
        sortOrder: plan.sortOrder,
        isActive: plan.isActive,
      }));
  }

  async savePlatformPlanCatalog(dto: SavePlatformPlansDto): Promise<PlatformPlanCatalogEntry[]> {
    const normalizedPlans = dto.plans
      .map((plan, index) => this.normalizePlanCatalogEntry(plan, index))
      .filter((plan): plan is PlatformPlanCatalogEntry => plan !== null);

    if (!normalizedPlans.length) {
      throw new BadRequestException('At least one valid subscription plan is required.');
    }

    const invalidModules = normalizedPlans.flatMap((plan) =>
      plan.defaultModules.filter(
        (moduleKey) => !ALL_BUSINESS_MODULE_KEYS.includes(moduleKey as (typeof ALL_BUSINESS_MODULE_KEYS)[number]),
      ),
    );

    if (invalidModules.length) {
      throw new BadRequestException(`Invalid module keys in plan catalog: ${Array.from(new Set(invalidModules)).join(', ')}`);
    }

    const nextCatalog = normalizedPlans.sort((a, b) => a.sortOrder - b.sortOrder);
    await this.prisma.platformSetting.upsert({
      where: { key: PLATFORM_PLANS_KEY },
      update: { value: { plans: nextCatalog } as unknown as Prisma.InputJsonValue },
      create: {
        key: PLATFORM_PLANS_KEY,
        value: { plans: nextCatalog } as unknown as Prisma.InputJsonValue,
      },
    });

    const billing = await this.getPlatformBillingConfig();
    const nextBillingPlans = { ...billing.plans };
    for (const plan of nextCatalog) {
      if (!nextBillingPlans[plan.key]) {
        nextBillingPlans[plan.key] = {
          monthlyPriceLkr: plan.priceLkr,
          seats: plan.seats,
        };
      }
    }

    await this.prisma.platformSetting.upsert({
      where: { key: PLATFORM_BILLING_KEY },
      update: {
        value: {
          ...billing,
          plans: nextBillingPlans,
        } as unknown as Prisma.InputJsonValue,
      },
      create: {
        key: PLATFORM_BILLING_KEY,
        value: {
          ...billing,
          plans: nextBillingPlans,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    this.planCatalogCache = nextCatalog;
    return nextCatalog;
  }

  async getPlatformBillingConfig(): Promise<PlatformBillingConfig> {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: PLATFORM_BILLING_KEY },
    });

    if (!row?.value || typeof row.value !== 'object' || Array.isArray(row.value)) {
      return DEFAULT_PLATFORM_BILLING;
    }

    const stored = row.value as Partial<PlatformBillingConfig>;
    return {
      taxRate: typeof stored.taxRate === 'number' ? stored.taxRate : DEFAULT_PLATFORM_BILLING.taxRate,
      overageSeatPriceLkr:
        typeof stored.overageSeatPriceLkr === 'number'
          ? stored.overageSeatPriceLkr
          : DEFAULT_PLATFORM_BILLING.overageSeatPriceLkr,
      plans: {
        ...DEFAULT_PLATFORM_BILLING.plans,
        ...(stored.plans ?? {}),
      },
    };
  }

  async savePlatformBillingConfig(dto: SavePlatformBillingDto): Promise<PlatformBillingConfig> {
    const current = await this.getPlatformBillingConfig();
    const nextPlans = { ...current.plans };

    if (dto.plans) {
      for (const [planKey, planValue] of Object.entries(dto.plans)) {
        const normalized = normalizePlan(planKey);
        nextPlans[normalized] = {
          monthlyPriceLkr:
            planValue.monthlyPriceLkr === null
              ? null
              : typeof planValue.monthlyPriceLkr === 'number'
                ? planValue.monthlyPriceLkr
                : (nextPlans[normalized]?.monthlyPriceLkr ?? null),
          seats:
            planValue.seats === null
              ? null
              : typeof planValue.seats === 'number'
                ? planValue.seats
                : (nextPlans[normalized]?.seats ?? null),
        };
      }
    }

    const next: PlatformBillingConfig = {
      taxRate: dto.taxRate ?? current.taxRate,
      overageSeatPriceLkr: dto.overageSeatPriceLkr ?? current.overageSeatPriceLkr,
      plans: nextPlans,
    };

    await this.prisma.platformSetting.upsert({
      where: { key: PLATFORM_BILLING_KEY },
      update: { value: next as unknown as Prisma.InputJsonValue },
      create: {
        key: PLATFORM_BILLING_KEY,
        value: next as unknown as Prisma.InputJsonValue,
      },
    });

    return next;
  }

  computeTenantBilling(input: {
    plan: string;
    seats: number;
    activeEmployees: number;
    billingConfig?: PlatformBillingConfig;
  }) {
    const config = input.billingConfig ?? DEFAULT_PLATFORM_BILLING;
    const normalizedPlan = normalizePlan(input.plan);
    const planConfig = config.plans[normalizedPlan] ?? config.plans.STARTER;
    const unlimited = isUnlimitedPlan(normalizedPlan) || input.seats >= 999999;
    const includedSeats = input.seats;
    const activeEmployees = input.activeEmployees;
    const overageSeats = unlimited ? 0 : Math.max(activeEmployees - includedSeats, 0);
    const monthlyPrice = planConfig?.monthlyPriceLkr;
    const isCustomPricing = monthlyPrice === null || monthlyPrice === undefined;
    const baseAmount = isCustomPricing ? 0 : monthlyPrice;
    const overageAmount = overageSeats * config.overageSeatPriceLkr;
    const subtotal = baseAmount + overageAmount;
    const tax = Number((subtotal * config.taxRate).toFixed(2));
    const totalDue = Number((subtotal + tax).toFixed(2));

    return {
      planKey: normalizedPlan,
      includedSeats,
      activeEmployees,
      overageSeats,
      monthlyPlanPrice: monthlyPrice,
      overageSeatPrice: config.overageSeatPriceLkr,
      isCustomPricing,
      baseAmount,
      overageAmount,
      subtotal,
      taxRate: config.taxRate,
      tax,
      totalDue,
    };
  }

  async getTenantSeats(tenantId: number): Promise<number> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { seats: true },
    });
    return tenant?.seats ?? 0;
  }

  buildDefaultModuleFeatures(
    enabledModules: string[],
    overrides?: Record<string, Record<string, { enabled?: boolean; required?: boolean }>>,
  ) {
    const moduleFeatures: Record<string, Record<string, { enabled: boolean; required: boolean }>> = {
      ...(overrides as Record<string, Record<string, { enabled: boolean; required: boolean }>>),
    };

    if (!enabledModules.includes('employees')) {
      return moduleFeatures;
    }

    moduleFeatures.employees = { ...(moduleFeatures.employees ?? {}) };
    for (const fieldKey of DEFAULT_EMPLOYEE_PROFILE_FIELDS) {
      if (moduleFeatures.employees[fieldKey] === undefined) {
        moduleFeatures.employees[fieldKey] = {
          enabled: true,
          required: fieldKey === 'nic' || fieldKey === 'epfNo',
        };
      }
    }

    return moduleFeatures;
  }

  createPlatformModule(dto: CreateModuleDefinitionDto) {
    const key = dto.key.trim().toLowerCase();
    return this.prisma.moduleDefinition.create({
      data: {
        key,
        label: dto.label.trim(),
        description: dto.description?.trim(),
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  listPlatformModuleFields(moduleKey: string) {
    return this.prisma.fieldDefinition.findMany({
      where: { moduleKey },
      orderBy: { fieldKey: 'asc' },
    });
  }

  createPlatformField(moduleKey: string, dto: CreateFieldDefinitionDto) {
    const fieldKey = dto.fieldKey.trim();
    return this.prisma.fieldDefinition.create({
      data: {
        moduleKey,
        fieldKey,
        label: dto.label.trim(),
        fieldType: dto.fieldType.trim(),
        options: (dto.options ?? undefined) as Prisma.InputJsonValue | undefined,
        isSystem: dto.isSystem ?? false,
        isActive: dto.isActive ?? true,
      },
    });
  }
}
