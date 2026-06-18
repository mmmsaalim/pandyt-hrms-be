export type PayslipTemplateDefinition = {
  key: string;
  label: string;
  description: string;
  locale: string;
};

export const PAYSLIP_TEMPLATE_CATALOG: PayslipTemplateDefinition[] = [
  {
    key: 'STANDARD_LKR',
    label: 'Standard LKR Payslip',
    description: 'Basic earnings, deductions, EPF/ETF summary — suitable for most SL companies.',
    locale: 'en-LK',
  },
  {
    key: 'DETAILED_LKR',
    label: 'Detailed LKR Payslip',
    description: 'Itemised allowances, canteen, loans, and statutory breakdown.',
    locale: 'en-LK',
  },
  {
    key: 'COMPACT_LKR',
    label: 'Compact Payslip',
    description: 'Single-page minimal layout for small teams.',
    locale: 'en-LK',
  },
  {
    key: 'CUSTOM',
    label: 'Custom template',
    description: 'Tenant-specific layout — configured by super admin / platform catalog.',
    locale: 'en-LK',
  },
];

export const DEFAULT_PAYSLIP_TEMPLATE_KEY = 'STANDARD_LKR';

export function payslipTemplateLabel(key: string): string {
  return PAYSLIP_TEMPLATE_CATALOG.find((row) => row.key === key)?.label ?? key;
}
