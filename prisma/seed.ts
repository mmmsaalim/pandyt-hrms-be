import { PrismaClient } from '@prisma/client';
import { backfillEmployeeProfileFields } from './seeds/backfill.seed';
import { seedModuleAndFieldCatalog } from './seeds/catalog.seed';
import { cleanupLegacyConfigurationRoles, seedDemoTenantData } from './seeds/demo-data.seed';
import { seedRolesAndPermissions } from './seeds/roles-permissions.seed';
import { backfillRbacJobRoles } from './seeds/rbac-backfill.seed';
import { seedSriLankaHolidays } from './seeds/holidays.seed';
import { createSeedPasswordHash, seedSuperAdmin, seedTenants } from './seeds/tenants.seed';

const prisma = new PrismaClient();

async function main() {
  const roleIds = await seedRolesAndPermissions(prisma);
  await seedModuleAndFieldCatalog(prisma);

  const passwordHash = await createSeedPasswordHash();
  await seedSuperAdmin(prisma, roleIds, passwordHash);

  const tenantContext = await seedTenants(prisma, roleIds, passwordHash);
  await seedDemoTenantData(prisma, tenantContext);
  await cleanupLegacyConfigurationRoles(prisma);
  await backfillEmployeeProfileFields(prisma);
  await backfillRbacJobRoles(prisma);
  await seedSriLankaHolidays(prisma);

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
