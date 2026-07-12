import { PrismaClient } from '@prisma/client';
import { DEFAULT_EMPLOYEE_PROFILE_FIELDS } from './constants';

export async function backfillEmployeeProfileFields(prisma: PrismaClient): Promise<void> {
  const tenantsWithEmployees = await prisma.tenantModuleSetting.findMany({
    where: { moduleKey: 'employees', enabled: true },
    select: { tenantId: true },
  });

  for (const { tenantId } of tenantsWithEmployees) {
    for (const fieldKey of DEFAULT_EMPLOYEE_PROFILE_FIELDS) {
      await prisma.tenantFieldSetting.upsert({
        where: {
          tenantId_moduleKey_fieldKey: {
            tenantId,
            moduleKey: 'employees',
            fieldKey,
          },
        },
        update: {
          enabled: true,
          required: fieldKey === 'nic' || fieldKey === 'epfNo',
        },
        create: {
          tenantId,
          moduleKey: 'employees',
          fieldKey,
          enabled: true,
          required: fieldKey === 'nic' || fieldKey === 'epfNo',
          sortOrder: 0,
        },
      });
    }
  }
}
