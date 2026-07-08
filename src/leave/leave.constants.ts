/** Sri Lanka–aligned default leave policy presets (Shop & Office / common HR practice). */
export type LeavePolicyPreset = {
  code: string;
  name: string;
  days: number;
  carryForwardLimit: number;
  accrualRate: number;
  sortOrder: number;
  description?: string;
  genderScope?: 'ALL' | 'FEMALE' | 'MALE';
};

export const SRI_LANKA_LEAVE_PRESET_KEY = 'SRI_LANKA';

export const SRI_LANKA_LEAVE_POLICIES: LeavePolicyPreset[] = [
  {
    code: 'annual',
    name: 'Annual',
    days: 14,
    carryForwardLimit: 7,
    accrualRate: 14 / 12,
    sortOrder: 1,
    description: 'Annual leave — 14 days per year (typical SL entitlement after qualifying period).',
    genderScope: 'ALL',
  },
  {
    code: 'casual',
    name: 'Casual',
    days: 7,
    carryForwardLimit: 0,
    accrualRate: 7 / 12,
    sortOrder: 2,
    description: 'Casual leave for short personal matters.',
    genderScope: 'ALL',
  },
  {
    code: 'sick',
    name: 'Sick',
    days: 7,
    carryForwardLimit: 0,
    accrualRate: 0,
    sortOrder: 3,
    description: 'Sick leave — medical certificate may be required.',
    genderScope: 'ALL',
  },
  {
    code: 'medical',
    name: 'Medical',
    days: 7,
    carryForwardLimit: 0,
    accrualRate: 0,
    sortOrder: 4,
    description: 'Medical leave (hospitalisation / extended treatment).',
    genderScope: 'ALL',
  },
  {
    code: 'maternity',
    name: 'Maternity',
    days: 84,
    carryForwardLimit: 0,
    accrualRate: 0,
    sortOrder: 5,
    description: 'Maternity leave — 12 weeks (84 working days) per SL labour practice.',
    genderScope: 'FEMALE',
  },
];

export type LeaveSetupConfig = {
  preset?: string;
  policies?: Array<Partial<LeavePolicyPreset> & { name: string; days: number }>;
};

export function resolveLeavePolicies(setup?: LeaveSetupConfig | null): LeavePolicyPreset[] {
  if (!setup?.policies?.length) {
    return SRI_LANKA_LEAVE_POLICIES.map((row) => ({ ...row }));
  }

  return setup.policies.map((row, index) => {
    const base =
      SRI_LANKA_LEAVE_POLICIES.find(
        (preset) =>
          preset.code === row.code?.trim().toLowerCase() ||
          preset.name.toLowerCase() === row.name.trim().toLowerCase(),
      ) ?? SRI_LANKA_LEAVE_POLICIES[0];

    return {
      code: row.code?.trim().toLowerCase() ?? base.code,
      name: row.name.trim(),
      days: Number(row.days ?? base.days),
      carryForwardLimit: Number(row.carryForwardLimit ?? base.carryForwardLimit),
      accrualRate: Number(row.accrualRate ?? base.accrualRate),
      sortOrder: Number(row.sortOrder ?? index + 1),
      description: row.description ?? base.description,
      genderScope: (row.genderScope as LeavePolicyPreset['genderScope']) ?? base.genderScope ?? 'ALL',
    };
  });
}
