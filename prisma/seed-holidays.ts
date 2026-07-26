import { PrismaClient } from '@prisma/client';
import { seedSriLankaHolidays } from './seeds/holidays.seed';

/**
 * Standalone runner: populates the Sri Lanka holiday calendar for every tenant
 * WITHOUT running the rest of the seed (roles, tenants, demo data). Idempotent
 * and non-destructive — it only upserts CompanyHoliday rows.
 *
 *   yarn seed:holidays   (or)   npm run seed:holidays
 */
const prisma = new PrismaClient();

seedSriLankaHolidays(prisma)
  .then(() => console.log('Holiday seed completed.'))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
