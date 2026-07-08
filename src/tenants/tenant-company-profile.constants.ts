import { TenantCompanyProfileDto } from './dto/tenant-company-profile.dto';

export const SRI_LANKA_INDUSTRY_TYPES = [
  'IT Services',
  'BPO / Contact Centre',
  'Manufacturing',
  'Trading / Import Export',
  'Retail',
  'Hospitality',
  'Healthcare',
  'Education',
  'Construction',
  'Financial Services',
  'Agriculture',
  'Logistics',
  'Other',
] as const;

export const SRI_LANKA_DISTRICTS = [
  'Colombo',
  'Gampaha',
  'Kalutara',
  'Kandy',
  'Matale',
  'Nuwara Eliya',
  'Galle',
  'Matara',
  'Hambantota',
  'Jaffna',
  'Kilinochchi',
  'Mannar',
  'Vavuniya',
  'Mullaitivu',
  'Batticaloa',
  'Ampara',
  'Trincomalee',
  'Kurunegala',
  'Puttalam',
  'Anuradhapura',
  'Polonnaruwa',
  'Badulla',
  'Monaragala',
  'Ratnapura',
  'Kegalle',
] as const;

export type TenantCompanyProfile = {
  brNumber?: string | null;
  registeredAddress?: string | null;
  city?: string | null;
  district?: string | null;
  industryType?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  adminPhone?: string | null;
  tinNumber?: string | null;
  website?: string | null;
};

export function normalizeCompanyProfile(
  input?: TenantCompanyProfileDto | TenantCompanyProfile | null,
): TenantCompanyProfile | undefined {
  if (!input) {
    return undefined;
  }

  const profile: TenantCompanyProfile = {
    brNumber: trimOrNull(input.brNumber),
    registeredAddress: trimOrNull(input.registeredAddress),
    city: trimOrNull(input.city),
    district: trimOrNull(input.district),
    industryType: trimOrNull(input.industryType),
    companyPhone: trimOrNull(input.companyPhone),
    companyEmail: trimOrNull(input.companyEmail),
    adminPhone: trimOrNull(input.adminPhone),
    tinNumber: trimOrNull(input.tinNumber),
    website: trimOrNull(input.website),
  };

  const hasValue = Object.values(profile).some((value) => value);
  return hasValue ? profile : undefined;
}

function trimOrNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function readCompanyProfile(config: unknown): TenantCompanyProfile | null {
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return null;
  }

  const profile = (config as Record<string, unknown>).companyProfile;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return null;
  }

  return profile as TenantCompanyProfile;
}
