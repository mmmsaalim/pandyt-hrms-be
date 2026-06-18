export const ALL_BUSINESS_MODULE_KEYS = [
  'employees',
  'organisation',
  'leave',
  'attendance',
  'payroll',
  'payslips',
  'recruitment',
  'reports',
  'canteen',
] as const;

export type BusinessModuleKey = (typeof ALL_BUSINESS_MODULE_KEYS)[number];

export const PLATFORM_MODULE_CATALOG: Array<{ key: BusinessModuleKey; label: string; sortOrder: number }> = [
  { key: 'employees', label: 'Employees', sortOrder: 1 },
  { key: 'organisation', label: 'Organisation', sortOrder: 2 },
  { key: 'leave', label: 'Leave', sortOrder: 3 },
  { key: 'attendance', label: 'Attendance', sortOrder: 4 },
  { key: 'payroll', label: 'Payroll', sortOrder: 5 },
  { key: 'payslips', label: 'Payslips', sortOrder: 6 },
  { key: 'recruitment', label: 'Recruitment', sortOrder: 7 },
  { key: 'reports', label: 'Reports', sortOrder: 8 },
  { key: 'canteen', label: 'Canteen', sortOrder: 9 },
];

export const PLAN_MODULE_PRESETS: Record<string, BusinessModuleKey[]> = {
  FREEMIUM: ['employees', 'leave'],
  BASIC: ['employees', 'leave', 'attendance', 'reports'],
  STARTER: ['employees', 'leave', 'attendance', 'reports'],
  GROWTH: [
    'employees',
    'leave',
    'attendance',
    'payroll',
    'payslips',
    'recruitment',
    'organisation',
    'reports',
    'canteen',
  ],
  ENTERPRISE: [...ALL_BUSINESS_MODULE_KEYS],
};

/** BRD §15.1 — included employee seats per subscription tier. null = unlimited. */
export const PLAN_SEAT_LIMITS: Record<string, number | null> = {
  FREEMIUM: 10,
  STARTER: 50,
  GROWTH: 200,
  ENTERPRISE: null,
};

export const PLAN_CATALOG = [
  {
    key: 'FREEMIUM',
    label: 'Freemium',
    seats: PLAN_SEAT_LIMITS.FREEMIUM,
    priceLkr: 0,
    description: 'Up to 10 employees — Core HR + Leave',
  },
  {
    key: 'STARTER',
    label: 'Starter',
    seats: PLAN_SEAT_LIMITS.STARTER,
    priceLkr: 4000,
    description: 'Up to 50 employees — Core HR, Leave, Attendance, Reports',
  },
  {
    key: 'GROWTH',
    label: 'Growth',
    seats: PLAN_SEAT_LIMITS.GROWTH,
    priceLkr: 12000,
    description: 'Up to 200 employees — Starter + ATS, Payroll, Organisation',
  },
  {
    key: 'ENTERPRISE',
    label: 'Enterprise',
    seats: PLAN_SEAT_LIMITS.ENTERPRISE,
    priceLkr: null,
    description: 'Unlimited employees — all modules + custom integrations',
  },
] as const;

/** Sri Lanka standard employee profile fields enabled by default on tenant onboarding. */
export const DEFAULT_EMPLOYEE_PROFILE_FIELDS = [
  'nic',
  'epfNo',
  'etfNo',
  'dateOfBirth',
  'phone',
  'gender',
  'emergencyContact',
  'employmentType',
] as const;

export const DEFAULT_TENANT_CONFIG = {
  locale: 'en-LK',
  currency: 'LKR',
  fiscalYearStartMonth: 4,
  payslipTemplateKey: 'STANDARD_LKR',
  leaveSetup: {
    preset: 'SRI_LANKA',
  },
};

export function normalizePlan(plan: string): string {
  return plan.trim().toUpperCase();
}

export function modulesForPlan(plan: string): BusinessModuleKey[] {
  const normalized = normalizePlan(plan);
  return PLAN_MODULE_PRESETS[normalized] ?? PLAN_MODULE_PRESETS.STARTER;
}

export function seatsForPlan(plan: string): number {
  const normalized = normalizePlan(plan);
  const limit = PLAN_SEAT_LIMITS[normalized];
  if (limit === null) {
    return 999999;
  }
  return limit ?? PLAN_SEAT_LIMITS.STARTER ?? 50;
}

export function resolveSeatsForPlan(plan: string, override?: number): number {
  if (typeof override === 'number' && override > 0) {
    return Math.floor(override);
  }
  return seatsForPlan(plan);
}

export function isUnlimitedPlan(plan: string): boolean {
  const normalized = normalizePlan(plan);
  return PLAN_SEAT_LIMITS[normalized] === null;
}

export function permissionToModule(permission: string): string {
  return permission.split('.')[0] ?? permission;
}

export const PLATFORM_BILLING_KEY = 'billing';

export type PlatformBillingPlanConfig = {
  monthlyPriceLkr: number | null;
  seats: number | null;
};

export type PlatformBillingConfig = {
  taxRate: number;
  overageSeatPriceLkr: number;
  plans: Record<string, PlatformBillingPlanConfig>;
};

export const DEFAULT_PLATFORM_BILLING: PlatformBillingConfig = {
  taxRate: 0.18,
  overageSeatPriceLkr: 500,
  plans: {
    FREEMIUM: { monthlyPriceLkr: 0, seats: 10 },
    STARTER: { monthlyPriceLkr: 4000, seats: 50 },
    GROWTH: { monthlyPriceLkr: 12000, seats: 200 },
    ENTERPRISE: { monthlyPriceLkr: null, seats: null },
  },
};
