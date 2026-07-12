import { PrismaClient } from '@prisma/client';
import { ALL_BUSINESS_MODULE_KEYS, EMPLOYEE_FIELD_CATALOG, MODULE_CATALOG } from './constants';

export async function seedModuleAndFieldCatalog(prisma: PrismaClient): Promise<void> {
  for (const module of MODULE_CATALOG) {
    await prisma.moduleDefinition.upsert({
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

  for (const field of EMPLOYEE_FIELD_CATALOG) {
    await prisma.fieldDefinition.upsert({
      where: {
        moduleKey_fieldKey: {
          moduleKey: 'employees',
          fieldKey: field.fieldKey,
        },
      },
      update: {
        label: field.label,
        fieldType: field.fieldType,
        options: field.options ?? undefined,
        isActive: true,
      },
      create: {
        moduleKey: 'employees',
        fieldKey: field.fieldKey,
        label: field.label,
        fieldType: field.fieldType,
        options: field.options ?? undefined,
        isSystem: false,
        isActive: true,
      },
    });
  }
}

export async function seedTenantConfiguration(
  prisma: PrismaClient,
  tenantId: number,
  enabledModules: string[],
  moduleFeatures: Record<string, Record<string, { enabled: boolean; required?: boolean }>>,
): Promise<void> {
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      config: {
        locale: 'en-LK',
        currency: 'LKR',
        fiscalYearStartMonth: 4,
      },
    },
  });

  for (const moduleKey of ALL_BUSINESS_MODULE_KEYS) {
    await prisma.tenantModuleSetting.upsert({
      where: {
        tenantId_moduleKey: { tenantId, moduleKey },
      },
      update: { enabled: enabledModules.includes(moduleKey) },
      create: {
        tenantId,
        moduleKey,
        enabled: enabledModules.includes(moduleKey),
      },
    });
  }

  const definitions = await prisma.fieldDefinition.findMany({
    where: { moduleKey: { in: enabledModules }, isActive: true },
  });

  for (const definition of definitions) {
    const feature = moduleFeatures[definition.moduleKey]?.[definition.fieldKey];
    await prisma.tenantFieldSetting.upsert({
      where: {
        tenantId_moduleKey_fieldKey: {
          tenantId,
          moduleKey: definition.moduleKey,
          fieldKey: definition.fieldKey,
        },
      },
      update: {
        enabled: feature?.enabled ?? false,
        required: feature?.required ?? false,
      },
      create: {
        tenantId,
        moduleKey: definition.moduleKey,
        fieldKey: definition.fieldKey,
        enabled: feature?.enabled ?? false,
        required: feature?.required ?? false,
      },
    });
  }
}
