import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface UpcomingBirthday {
  employeeId: number;
  name: string;
  date: string;
  daysUntil: number;
}

export interface UpcomingHoliday {
  name: string;
  date: string;
  daysUntil: number;
}

interface BirthdayCandidate {
  id: number;
  dateOfBirth: Date | null;
  user: { firstName: string | null; lastName: string | null } | null;
}

// Sri Lanka public holidays (static list, recurring by month/day).
const SRI_LANKA_HOLIDAYS: Array<{ name: string; month: number; day: number }> = [
  { name: 'Thai Pongal', month: 1, day: 14 },
  { name: 'Independence Day', month: 2, day: 4 },
  { name: 'Maha Sivarathri', month: 2, day: 26 },
  { name: 'Milad un Nabi', month: 3, day: 31 },
  { name: 'Sinhala & Tamil New Year', month: 4, day: 13 },
  { name: 'Sinhala & Tamil New Year (Holiday)', month: 4, day: 14 },
  { name: 'Labour Day', month: 5, day: 1 },
  { name: 'Vesak Full Moon Poya', month: 5, day: 12 },
  { name: 'Poson Full Moon Poya', month: 6, day: 11 },
  { name: 'Esala Full Moon Poya', month: 7, day: 10 },
  { name: 'Nikini Full Moon Poya', month: 8, day: 9 },
  { name: 'Binara Full Moon Poya', month: 9, day: 7 },
  { name: 'Vap Full Moon Poya', month: 10, day: 6 },
  { name: 'Deepavali', month: 10, day: 20 },
  { name: 'Ill Full Moon Poya', month: 11, day: 5 },
  { name: 'Christmas Day', month: 12, day: 25 },
  { name: 'Unduvap Full Moon Poya', month: 12, day: 4 },
];

/**
 * Central place for "what's coming up on the calendar" queries (birthdays, public
 * holidays) so dashboard/leave/attendance features share one implementation
 * instead of each re-deriving next-occurrence date math.
 */
@Injectable()
export class HrCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getUpcomingBirthdays(
    tenantId: number,
    options: { excludeEmployeeId?: number; employeeIds?: number[]; daysAhead?: number } = {},
  ): Promise<UpcomingBirthday[]> {
    const { excludeEmployeeId, employeeIds, daysAhead = 30 } = options;

    const employees = await this.prisma.employee.findMany({
      where: {
        tenantId,
        deletedAt: null,
        dateOfBirth: { not: null },
        ...(excludeEmployeeId ? { id: { not: excludeEmployeeId } } : {}),
        ...(employeeIds ? { id: { in: employeeIds } } : {}),
      },
      select: {
        id: true,
        dateOfBirth: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });

    return this.buildUpcomingBirthdays(employees, daysAhead);
  }

  private buildUpcomingBirthdays(
    employees: BirthdayCandidate[],
    daysAhead: number,
    today: Date = new Date(),
  ): UpcomingBirthday[] {
    const referenceDate = new Date(today);
    referenceDate.setHours(0, 0, 0, 0);

    const upcoming: UpcomingBirthday[] = [];

    for (const employee of employees) {
      if (!employee.dateOfBirth) continue;

      const dob = new Date(employee.dateOfBirth);
      const nextBirthday = new Date(referenceDate.getFullYear(), dob.getMonth(), dob.getDate());

      if (nextBirthday < referenceDate) {
        nextBirthday.setFullYear(referenceDate.getFullYear() + 1);
      }

      const daysUntil = this.daysBetween(referenceDate, nextBirthday);
      if (daysUntil > daysAhead) continue;

      const name =
        `${employee.user?.firstName ?? ''} ${employee.user?.lastName ?? ''}`.trim() ||
        `Employee #${employee.id}`;

      upcoming.push({
        employeeId: employee.id,
        name,
        date: nextBirthday.toISOString().split('T')[0],
        daysUntil,
      });
    }

    return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  }

  getUpcomingHolidays(from: Date = new Date(), take = 5): UpcomingHoliday[] {
    const referenceDate = new Date(from);
    referenceDate.setHours(0, 0, 0, 0);
    const year = referenceDate.getFullYear();

    const holidays = SRI_LANKA_HOLIDAYS.map((holiday) => {
      let date = new Date(year, holiday.month - 1, holiday.day);
      if (date < referenceDate) {
        date = new Date(year + 1, holiday.month - 1, holiday.day);
      }

      return {
        name: holiday.name,
        date: date.toISOString().split('T')[0],
        daysUntil: this.daysBetween(referenceDate, date),
      };
    });

    return holidays
      .filter((holiday) => holiday.daysUntil >= 0)
      .sort((a, b) => a.daysUntil - b.daysUntil)
      .slice(0, take);
  }

  private daysBetween(from: Date, to: Date): number {
    return Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  }
}
