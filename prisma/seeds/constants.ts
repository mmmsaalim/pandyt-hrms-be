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

export const modulesForPlan = (plan: string): string[] => {
  const normalized = plan.trim().toUpperCase();
  if (normalized === 'FREEMIUM') return ['employees', 'leave'];
  if (normalized === 'BASIC' || normalized === 'STARTER') {
    return ['employees', 'leave', 'attendance', 'reports'];
  }
  if (normalized === 'GROWTH') {
    return [
      'employees',
      'leave',
      'attendance',
      'payroll',
      'payslips',
      'recruitment',
      'organisation',
      'reports',
      'canteen',
    ];
  }
  return [...ALL_BUSINESS_MODULE_KEYS];
};

export const PERMISSION_CATALOG: Array<{ permission: string; module: string; description: string }> = [
  { permission: 'tenants.read', module: 'tenants', description: 'View tenant records.' },
  { permission: 'tenants.create', module: 'tenants', description: 'Create tenant records.' },
  { permission: 'tenants.delete', module: 'tenants', description: 'Delete tenant records.' },
  { permission: 'employees.read', module: 'employees', description: 'View tenant employees.' },
  { permission: 'employees.invite', module: 'employees', description: 'Invite tenant employees.' },
  { permission: 'leave.read', module: 'leave', description: 'View leave requests.' },
  { permission: 'leave.manage', module: 'leave', description: 'Approve and reject leave requests.' },
  { permission: 'attendance.read', module: 'attendance', description: 'View attendance records.' },
  { permission: 'canteen.read', module: 'canteen', description: 'View canteen meal entries.' },
  { permission: 'canteen.manage', module: 'canteen', description: 'Manage canteen meal entries and settings.' },
  { permission: 'payroll.manage', module: 'payroll', description: 'Manage payroll runs.' },
  { permission: 'payslips.manage', module: 'payslips', description: 'Manage payslips.' },
  { permission: 'reports.read', module: 'reports', description: 'View reports.' },
  {
    permission: 'configuration.manage',
    module: 'configuration',
    description: 'Manage tenant roles and permission assignments.',
  },
  {
    permission: 'organisation.manage',
    module: 'organisation',
    description: 'Manage locations, departments, and teams.',
  },
  {
    permission: 'organisation.read',
    module: 'organisation',
    description: 'View organisation tree and structure.',
  },
  {
    permission: 'recruitment.read',
    module: 'recruitment',
    description: 'View job posts and candidates.',
  },
  {
    permission: 'recruitment.manage',
    module: 'recruitment',
    description: 'Manage job posts, candidates, and hiring pipeline.',
  },
];

export const MODULE_CATALOG = [
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

export const EMPLOYEE_FIELD_CATALOG = [
  { fieldKey: 'nic', label: 'NIC Number', fieldType: 'text' },
  { fieldKey: 'epfNo', label: 'EPF Number', fieldType: 'text' },
  { fieldKey: 'etfNo', label: 'ETF Number', fieldType: 'text' },
  { fieldKey: 'tinNo', label: 'TIN Number', fieldType: 'text' },
  { fieldKey: 'dateOfBirth', label: 'Date of Birth', fieldType: 'date' },
  { fieldKey: 'phone', label: 'Phone Number', fieldType: 'text' },
  {
    fieldKey: 'gender',
    label: 'Gender',
    fieldType: 'select',
    options: { values: ['Male', 'Female'] },
  },
  { fieldKey: 'emergencyContact', label: 'Emergency Contact', fieldType: 'text' },
  {
    fieldKey: 'employmentType',
    label: 'Employment Type',
    fieldType: 'select',
    options: { values: ['Permanent', 'Contract', 'Probation', 'Intern'] },
  },
  { fieldKey: 'address', label: 'Residential Address', fieldType: 'text' },
  { fieldKey: 'bankName', label: 'Bank Name', fieldType: 'text' },
  { fieldKey: 'bankBranch', label: 'Bank Branch', fieldType: 'text' },
  { fieldKey: 'bankAccount', label: 'Bank Account Number', fieldType: 'text' },
  {
    fieldKey: 'religion',
    label: 'Religion',
    fieldType: 'select',
    options: { values: ['Buddhist', 'Christian', 'Hindu', 'Islam', 'Other'] },
  },
];

export const DEFAULT_EMPLOYEE_PROFILE_FIELDS = [
  'nic',
  'epfNo',
  'etfNo',
  'tinNo',
  'dateOfBirth',
  'phone',
  'gender',
  'emergencyContact',
  'employmentType',
  'address',
  'bankName',
  'bankBranch',
  'bankAccount',
] as const;

export const SEED_PASSWORD = 'admin@123';
