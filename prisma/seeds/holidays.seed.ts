import { PrismaClient } from '@prisma/client';

/**
 * Sri Lanka public holidays, seeded into every tenant's Working calendar
 * (CompanyHoliday) so the dashboard, leave, and payroll all share one editable
 * source of truth. After seeding, admins maintain these in the app
 * (Attendance → Working calendar) — no code change needed each year.
 *
 * `recurring: true`  → fixed civil holidays that repeat on the same month/day.
 * `recurring: false` → lunar / Islamic holidays whose dates shift yearly; the
 *   date below is for 2026 and should be verified against the official gazette
 *   and updated in the Working-calendar UI for future years.
 */
const SRI_LANKA_HOLIDAYS_2026: Array<{
  name: string;
  month: number;
  day: number;
  recurring: boolean;
}> = [
  { name: 'Thai Pongal', month: 1, day: 14, recurring: true },
  { name: 'Independence Day', month: 2, day: 4, recurring: true },
  { name: 'Maha Sivarathri', month: 2, day: 15, recurring: false },
  { name: 'Sinhala & Tamil New Year', month: 4, day: 13, recurring: true },
  { name: 'Sinhala & Tamil New Year (Holiday)', month: 4, day: 14, recurring: true },
  { name: 'Labour Day', month: 5, day: 1, recurring: true },
  { name: 'Vesak Full Moon Poya', month: 5, day: 1, recurring: false },
  { name: 'Poson Full Moon Poya', month: 5, day: 31, recurring: false },
  { name: 'Esala Full Moon Poya', month: 6, day: 29, recurring: false },
  { name: 'Nikini Full Moon Poya', month: 7, day: 28, recurring: false },
  { name: 'Binara Full Moon Poya', month: 8, day: 27, recurring: false },
  { name: 'Vap Full Moon Poya', month: 9, day: 25, recurring: false },
  { name: 'Deepavali', month: 11, day: 8, recurring: false },
  { name: 'Ill Full Moon Poya', month: 11, day: 24, recurring: false },
  { name: 'Unduvap Full Moon Poya', month: 12, day: 23, recurring: false },
  { name: 'Christmas Day', month: 12, day: 25, recurring: true },
];

const SEED_YEAR = 2026;

/**
 * Idempotent: upserts each holiday keyed on the CompanyHoliday @@unique
 * (tenantId, date). Re-running will not create duplicates. It does not delete
 * or overwrite admin-added holidays on other dates.
 */
export async function seedSriLankaHolidays(prisma: PrismaClient): Promise<void> {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  if (tenants.length === 0) {
    return;
  }

  let created = 0;
  for (const tenant of tenants) {
    for (const holiday of SRI_LANKA_HOLIDAYS_2026) {
      // Date stored at midnight UTC so it is stable regardless of server timezone.
      const date = new Date(Date.UTC(SEED_YEAR, holiday.month - 1, holiday.day));

      const result = await prisma.companyHoliday.upsert({
        where: { tenantId_date: { tenantId: tenant.id, date } },
        update: {},
        create: {
          tenantId: tenant.id,
          name: holiday.name,
          date,
          isRecurring: holiday.recurring,
          isPaid: true,
          isHalfDay: false,
        },
      });
      if (result) {
        created += 1;
      }
    }
  }

  console.log(`Seeded Sri Lanka ${SEED_YEAR} holidays for ${tenants.length} tenant(s).`);
}
