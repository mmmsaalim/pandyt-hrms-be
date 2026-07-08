# BE Instructions (FlowHR)

## 1) Purpose
Single source for backend context. This file is written for both humans and AI agents to quickly understand:
- project structure
- current delivery status
- implemented scope
- next target scope

## 2) Backend Snapshot
- Stack: NestJS + Prisma + PostgreSQL
- API base: `/api`
- Auth session: HttpOnly cookie `flowhr_access_token`
- Tenant model: strict tenant isolation using `tenantId` and `X-Tenant-ID`
- Current status: security baseline and core MVP complete, preparing next roadmap scope

## 3) Backend Structure
Main folders used in backend:
- `src/auth` - login, logout, JWT, tenant-aware auth
- `src/tenants` - super admin tenant onboarding/lifecycle
- `src/tenant-configuration` - super admin tenant-wise module/field configuration + platform catalog
- `src/roles` - company admin RBAC (tenant module roles, user access assignment)
- `src/employees` - employee CRUD, invite, export, anonymize
- `src/leave` - request, approvals, policies, balances, accrual
- `src/attendance` - clock-in/out, overrides
- `src/payroll` - payroll runs and statutory processing
- `src/payslips` - payslip records
- `src/organisation` - locations, departments, teams, tree
- `src/dashboard` - role-aware dashboard data
- `src/reports` - reporting endpoints
- `src/cross-tenant-reports` - super admin cross-tenant reporting endpoints
- `src/recruitment` - ATS core entities/endpoints
- `src/invitations` - resolve and accept invitation flow
- `src/letters` - HR letter generation (included on all plans; not a billable module toggle)
- `src/feedback` - team feedback capture for HR review (included on all plans)
- `src/common` - guards, decorators, tenant enforcement
- `src/prisma` - Prisma service + tenant middleware
- `prisma/schema.prisma` - DB schema
- `prisma/seed.ts` - idempotent seed

## 4) Role Model (Current)
- `SUPER_ADMIN`: platform tenant lifecycle + **tenant-wise configuration** (plan, enabled modules, custom fields)
- `COMPANY_ADMIN`: full tenant operations + **user/module role assignment** (Users & Permissions — not module toggles)
- `HR_MANAGER`: tenant HR identity role; **module access only via assigned tenant module roles** (e.g. `EMPLOYEES`, `LEAVE`)
- `TEAM_LEAD`: team identity role; **module access only via assigned tenant module roles**
- `EMPLOYEE`: self-service identity role; **module access only via assigned tenant module roles**

**Core HR tools (included on all plans — not module toggles)**
- Invitations (`src/invitations`), HR Letters (`src/letters`), Team Feedback (`src/feedback`)
- Feedback: `COMPANY_ADMIN`, `HR_MANAGER`, and `TEAM_LEAD` may list and submit feedback

## 5) Security Baseline Status (Complete)
Implemented and active:
- Tenant-aware login via `companyCode` for non-super-admin users
- HttpOnly cookie auth session
- `X-Tenant-ID` enforcement against JWT `tenantId`
- Prisma tenant middleware guardrails
- Cross-tenant access rejection
- One-time expiring invitation token flow

Key auth/invite endpoints:
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/tenants/onboard`
- `GET /api/invitations/resolve`
- `POST /api/invitations/accept`

## 6) Core MVP Status (Complete)
Implemented and active:
- Employee lifecycle: soft-delete, anonymize, export
- Organisation structure (BRD 6.3): location/department/team create + tree view — see Section 12 for step-by-step status
- Leave workflows: apply, approve/reject, balances, policies, accrual
- Attendance workflows: clock-in/out and HR override
- Statutory payroll processing (EPF/ETF/PAYE) and payslip generation
- Cross-Tenant Reports: Super Admin endpoints for multi-tenant data aggregation (Leave, Attendance, Payroll).
- **Tenant-wise configuration**: Super Admin sets plan, enabled modules, and custom employee fields per tenant; runtime enforced via login payload + `ModuleEnabledGuard`.
- **Company Admin RBAC**: tenant module roles (`EMPLOYEES`, `LEAVE`, etc.) assigned per user; `HR_MANAGER` / `TEAM_LEAD` / `EMPLOYEE` base roles do **not** auto-grant module permissions.
- Dashboard and reports core role-based data
- Role activation in app logic: `HR_MANAGER` and `TEAM_LEAD`

Key role-invite endpoint:
- `POST /api/employees/invite`
- Accepted roles: `EMPLOYEE | TEAM_LEAD | HR_MANAGER | COMPANY_ADMIN`
- Creator policy:
  - `COMPANY_ADMIN` can create all listed roles
  - `HR_MANAGER` can create `EMPLOYEE`, `TEAM_LEAD`, `HR_MANAGER`

## 13) Recruitment / ATS — BRD 6.6 (HR Manager Focus)

Active implementation target for **HR_MANAGER** and **COMPANY_ADMIN**.

### 13.1 BRD Role — HR Manager

HR Manager manages:
- Recruitment pipelines (job posts + candidates)
- Onboarding workflows (via employee invite — separate module)
- Employee records (`/employees`)
- Leave policies (`/leave`)

Recruitment page is **HR_MANAGER + COMPANY_ADMIN only** (sidebar + route).

### 13.2 Tenant Hierarchy

```
Tenant
 └── JobPost (OPEN / DRAFT / CLOSED)
      └── Candidate (pipeline stage + optional resume file)
```

Pipeline stages: `APPLIED → SCREENING → INTERVIEW → OFFER → HIRED / REJECTED`

### 13.3 API Endpoints (`/api/recruitment`)

| Method | Path | Roles |
|--------|------|-------|
| GET/POST | `/jobs` | COMPANY_ADMIN, HR_MANAGER |
| PATCH/DELETE | `/jobs/:id` | COMPANY_ADMIN, HR_MANAGER |
| GET/POST | `/candidates` | COMPANY_ADMIN, HR_MANAGER |
| PATCH/DELETE | `/candidates/:id` | COMPANY_ADMIN, HR_MANAGER |
| POST | `/candidates/:id/resume` | COMPANY_ADMIN, HR_MANAGER |
| GET | `/pipeline/summary` | COMPANY_ADMIN, HR_MANAGER |
| GET | `/api/public/careers/:companyCode/jobs` | Public |
| POST | `/api/public/careers/:companyCode/jobs/:jobId/apply` | Public |

Legacy aliases: `GET/POST/PATCH/DELETE /recruitment` (candidates).

Resume upload stores file to `uploads/resumes/{tenantId}/` and sets `resumeUrl`.
**AI parsing is NOT enabled** — response includes `parsingStatus: STORED`.

### 13.4 Implementation Status

| Step | Task | Status |
|------|------|--------|
| 1 | JobPost + Candidate schema | ✅ Done |
| 2 | Job/candidate CRUD API | ✅ Done |
| 3 | HR_MANAGER API access | ✅ Done |
| 4 | Resume upload stub (no AI) | ✅ Done |
| 5 | FE Jobs/Candidates/Pipeline tabs | ✅ Done |
| 6 | Public careers/apply flow | ✅ Done |
| 7 | AI resume parsing (Gemini) | ⏳ Phase 3 |
| 8 | Candidate AI scoring (pgvector) | ⏳ Phase 3 |
| 9 | Interview scheduling | ⏳ Later |

### 13.5 DB Migration Required

After pulling these changes, run:
```bash
yarn prisma db push --accept-data-loss
yarn prisma:generate
yarn prisma:seed
```

### 13.6 Rules for AI Agents

1. HR_MANAGER must have access to all recruitment write endpoints
2. Never parse resumes with AI until Phase 3 — store file only
3. All queries scoped by `tenantId`
4. Job delete blocked if active candidates in pipeline
5. Resume files: PDF/DOC/DOCX only, max 10MB

---

## 14) Super Admin Tenant Configuration (Tenant-Wise Setup)

This section documents the **Super Admin control plane** for per-tenant module and field configuration. Read this before touching `src/tenant-configuration`, tenant onboarding config, or login/runtime gating.

### 14.1 Two Configuration Planes (Do Not Mix)

| Plane | Who | What they configure | APIs / UI |
|-------|-----|---------------------|-----------|
| **Tenant setup** | `SUPER_ADMIN` | Subscription plan, enabled modules, custom field toggles/required flags, locale/currency/fiscal year | `PUT /api/tenants/:id/configuration`, FE `/tenants` + `/platform/catalog` |
| **User permissions** | `COMPANY_ADMIN` | Which users get which tenant module roles (`EMPLOYEES`, `LEAVE`, `ATTENDANCE`, …) and permission matrices | `src/roles`, FE `/configuration/users-permissions` |

Super Admin owns **what the tenant can use**. Company Admin owns **which users inside the tenant can use each enabled module**.

### 14.2 Data Model (`prisma/schema.prisma`)

```
ModuleDefinition (platform catalog)
 └── FieldDefinition

Tenant
 ├── config (JSON: locale, currency, fiscalYearStartMonth)
 ├── TenantModuleSetting (moduleKey, enabled)
 ├── TenantFieldSetting (moduleKey, fieldKey, enabled, required, sortOrder)
 └── Employee.customFields (JSON — validated against tenant field settings)
```

Seed creates platform catalog modules/fields and demo tenant module settings (Tenant 1 = full modules, Tenant 2 = limited).

### 14.3 Plan Presets vs Super Admin Override

Plan presets in `tenant-configuration.constants.ts`:

| Plan | Default modules |
|------|-----------------|
| `FREEMIUM` | employees, leave |
| `STARTER` / `BASIC` | + attendance, reports |
| `GROWTH` | + payroll, payslips, recruitment, organisation |
| `ENTERPRISE` | all business modules |

- Changing plan in Super Admin UI applies preset as **defaults** (module checkboxes reset to plan defaults).
- Super Admin **may enable modules beyond the plan tier** when saving tenant configuration (plan presets are not a hard ceiling).

### 14.4 Super Admin API Endpoints (`src/tenant-configuration`)

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| GET | `/api/platform/modules` | SUPER_ADMIN | List platform module catalog |
| POST | `/api/platform/modules` | SUPER_ADMIN | Add module to global catalog |
| GET | `/api/platform/modules/:key/fields` | SUPER_ADMIN | List fields for a module |
| POST | `/api/platform/modules/:key/fields` | SUPER_ADMIN | Add field to module catalog |
| GET | `/api/tenants/:id/configuration` | SUPER_ADMIN | Load tenant config wizard payload |
| PUT | `/api/tenants/:id/configuration` | SUPER_ADMIN | Save plan, modules, fields, locale settings |
| GET | `/api/tenants/:id/configuration/preview` | SUPER_ADMIN | Preview runtime config |

Tenant onboard (`POST /api/tenants/onboard`) and company-with-admin flows persist module/field settings via `TenantConfigurationService.persistModuleSettings` / `persistFieldSettings`.

Organisation structure (locations, departments, teams) is **not** captured during Super Admin onboarding. Company Admin sets this up later under **Organisation** (`/organisation`).

Super Admin onboarding stores Sri Lanka company registry details in `tenant.config.companyProfile`:
- `brNumber`, `registeredAddress`, `city`, `district`, `industryType`
- `companyPhone`, `companyEmail`, `adminPhone`
- `tinNumber`, `website` (optional statutory / contact fields)

Sri Lanka-only defaults (`locale=en-LK`, `currency=LKR`, fiscal month `4`, default payslip template) are implicit backend defaults. Do not add them back as required Super Admin onboarding fields unless the product becomes multi-country.

Usage-based billing uses plan seats plus active employee count. Onboarding may collect `billingContactEmails` and `billingReminderDays`, persisted to `TenantBillingSettings`.

### 14.5 Runtime Enforcement (Login + Guards)

Login (`src/auth/auth.service.ts`) for tenant users returns:

- `enabledModules` — modules enabled for the tenant (from `TenantModuleSetting`)
- `effectivePermissions` — user permissions filtered to enabled modules (+ `configuration.*` always kept for Company Admin RBAC screen)
- `tenantConfig` — plan, locale, currency, fiscal year, `fields` by module

Guards and filters:

- `ModuleEnabledGuard` + `@RequireModule('…')` on module controllers (employees, leave, attendance, payroll, payslips, recruitment, organisation, reports)
- `PermissionsGuard` + `@RequirePermissions('…')` on attendance endpoints (and extend as needed)
- `roles.service` filters configuration/invite data by enabled modules
- `employees.service` validates `customFields` against tenant field settings

### 14.6 Company Admin RBAC (Tenant Module Roles)

Tenant module roles are created per enabled module (name = module key uppercased, e.g. `ATTENDANCE`) with that module's permissions.

Permission resolution on login:

- `COMPANY_ADMIN` (global role): all seed permissions, filtered by `enabledModules`
- `HR_MANAGER`, `TEAM_LEAD`, `EMPLOYEE` (global roles): **no business permissions** — only tenant module roles grant access
- Tenant module roles (e.g. `EMPLOYEES`, `LEAVE`): grant module permissions when assigned to a user

Company Admin endpoints (`src/roles`):

- `POST /api/roles/tenant/bootstrap-modules` — create/update tenant module roles for enabled modules
- User assign/unassign scoped roles for module access (used by FE Configuration page)

Invite flow (`employees.service.inviteEmployee`) auto-assigns default module roles by invited job role, but Company Admin can later narrow access via Users & Permissions.

### 14.7 Implementation Status

| Step | Task | Status | Files |
|------|------|--------|-------|
| 1 | Prisma models + seed catalog | ✅ Done | `prisma/schema.prisma`, `prisma/seed.ts` |
| 2 | TenantConfigurationService + Super Admin APIs | ✅ Done | `src/tenant-configuration/*` |
| 3 | Login payload + ModuleEnabledGuard | ✅ Done | `src/auth/auth.service.ts`, `src/common/guards/module-enabled.guard.ts` |
| 4 | Employee customFields validation | ✅ Done | `src/employees/employees.service.ts` |
| 5 | Company Admin RBAC bootstrap + module role filter | ✅ Done | `src/roles/roles.service.ts` |
| 6 | HR_MANAGER/TEAM_LEAD permission via module roles only | ✅ Done | `src/auth/auth.service.ts` |
| 7 | Attendance PermissionsGuard | ✅ Done | `src/common/guards/permissions.guard.ts`, `src/attendance/*` |

### 14.8 Rules for AI Agents

1. **Never let Company Admin toggle tenant modules** — that is Super Admin only (`PUT /tenants/:id/configuration`).
2. **Never grant module permissions from HR_MANAGER/TEAM_LEAD/EMPLOYEE base roles** — use tenant module role assignment.
3. **Sidebar/API visibility** must respect both `enabledModules` (tenant) and `effectivePermissions` (user).
4. **Plan presets are defaults**, not save-time hard blocks for Super Admin.
5. **`configuration.manage`** is for Company Admin RBAC UI only — not a billable module toggle.
6. Organisation setup is **Company Admin → Organisation** — not Super Admin tenant onboarding.
7. Company code is an internal login key. Show it when necessary, but do not add copy buttons to tenant lists.

### 14.10 Tenant lifecycle (suspend / archive / reactivate)

Super Admin tenant status uses **`status`** + **`leadStatus`** together:

| Action | API | `status` | `leadStatus` | Login message for tenant users |
|--------|-----|----------|--------------|--------------------------------|
| Approve onboarding | `PATCH /api/tenants/:id/approve` | `ACTIVE` | `CONVERTED` | Normal login |
| **Deactivate (overdue payment)** | `PATCH /api/tenants/:id/deactivate-payment` | `SUSPENDED` | `CONVERTED` | Payment suspension message |
| **Archive** (soft off-board, reactivatable) | `DELETE /api/tenants/:id` | `SUSPENDED` | `DELETED` | Workspace deactivated — contact super admin |
| **Reactivate** | `PATCH /api/tenants/:id/reactivate` | `ACTIVE` | `CONVERTED` | Normal login |

Login checks (`src/auth/auth.service.ts`) must distinguish the three suspended cases above — never use one generic payment message for archived tenants.

Company Payments `billingStatus: OVERDUE` maps to `status === SUSPENDED` (both payment suspend and archive).

### 14.11 Quick Verification

1. Login as Super Admin → `/tenants` → **Configure Tenant** → set plan, enable/disable modules and employee fields → Save.
2. Login as that tenant's Company Admin → sidebar shows only enabled modules.
3. Configuration → Users & Permissions → assign only the module roles that user should have (e.g. `EMPLOYEES`, `LEAVE` — omit any others).
4. Login as that user after re-login → sidebar and routes show **only** assigned modules (same rule for every module: Employees, Leave, Attendance, Payroll, etc.).
5. Re-login after any permission change (JWT carries `effectivePermissions`).

---

## 7) Next Scope (Planned)
Planned next roadmap items:
- AI resume parsing and candidate scoring (Phase 3 — recruitment stub ready)
- Attrition risk and predictive analytics
- Advanced notifications (real-time channels)
- Expanded manager intelligence dashboards
- Additional automation and quality hardening

## 8) Environment and Commands
Required env:
- `DATABASE_URL`
- `JWT_SECRET`
- `APP_URL`
- `INVITATION_EXPIRY_HOURS`
- `PASSWORD_RESET_EXPIRY_HOURS`
- `EMAIL_PROVIDER` (`auto`, `smtp`, `resend`, `brevo`)
- `EMAIL_FAIL_FAST` (`false` for local testing to avoid 502 on provider throttling)
- `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` (for Mailtrap or SMTP provider)
- `RESEND_API_KEY` (optional)
- `BREVO_API_KEY` (optional)
- `MAIL_FROM` or `EMAIL_FROM` (optional)
- `MAIL_FROM_NAME` (optional)
- `MAIL_SUPPORT_EMAIL` (optional)

Local email testing notes:
- Mailtrap sandbox captures emails in Mailtrap inbox and does not deliver to real Gmail/phone inbox.
- Mailtrap free testing plans may return `550 5.7.0 Too many emails per second` when invitations are sent in bursts.
- With `EMAIL_FAIL_FAST=false`, email send failures are logged as warnings and API requests continue without `502`.

Dev commands:
- `yarn prisma:generate`
- `yarn prisma:migrate`
- `yarn prisma:seed`
- `yarn start:dev`
- `yarn build`

Email flow endpoints:
- `POST /api/auth/password/reset/request`
- `POST /api/auth/password/reset/confirm`

## 9) Quick Verification Checklist
- Login tenant user without `companyCode` fails
- Login tenant user with wrong `companyCode` fails
- Login tenant user with correct `companyCode` succeeds
- Protected tenant API without `X-Tenant-ID` fails
- Protected tenant API with mismatched `X-Tenant-ID` fails
- Invite with all 4 roles works for `COMPANY_ADMIN`
- Invite `COMPANY_ADMIN` by `HR_MANAGER` is rejected
- Super Admin `PUT /tenants/:id/configuration` saves modules beyond plan preset
- User without a tenant module role for a module does not see that module in sidebar/API after re-login (applies to all modules, not one specific module)

## 10) Canonical Reference Docs
For deeper detail (optional), see:
- `docs/ARCHITECTURE.md`
- `docs/PROJECT_STATUS.md`
- `docs/RBAC_PERMISSION_MATRIX.md`
- `docs/SETUP_STEPS.md`

## 12) Organisation Structure — BRD 6.3 (Company Admin Focus)

This section is the **active implementation target**. Read this before touching `src/organisation` or `pages/organisation`.

### 12.1 BRD Role Confirmation — Company Admin

BRD 4.1 defines **Company Admin** as:
- Owns **one tenant** (single company)
- Manages **departments**, payroll runs, company-wide policies, and **user provisioning**

For Organisation (BRD 6.3), Company Admin is the **primary owner** of tenant org structure:
- Create/edit/delete **Locations** (office branches — e.g. Colombo HQ, Kandy branch)
- Create/edit/delete **Departments** (linked to a location)
- Create/edit/delete **Teams** (linked to a department)
- View **Org Tree**: Location → Department → Team

HR Manager may also create/update org entities on the backend, but the FE page is currently **Company Admin only**.

### 12.2 Tenant Hierarchy (BRD 5.2 + 6.3)

```
Tenant (company)
 └── Location (work site / branch)
      └── Department
           └── Team
                └── Employee (FK: departmentId, teamId, locationId)
```

Every org table has `tenantId`. Prisma middleware enforces isolation — never query without tenant scope.

### 12.3 Sri Lanka Context (tenant-scoped, not global)

Org structure is **per company**, not platform-wide:
- Each tenant defines its own locations (e.g. "Colombo Head Office", "Kandy Branch")
- Departments and teams are names chosen by the company (HR, Finance, Engineering, etc.)
- Statutory fields (EPF/ETF) live on **employees**, not org entities
- Public holidays and fiscal year are tenant config (April–March default) — separate from org module

### 12.4 API Endpoints (`/api/organisation`)

| Method | Path | Write roles | Read roles |
|--------|------|-------------|------------|
| GET | `/tree` | — | COMPANY_ADMIN, HR_MANAGER, TEAM_LEAD, EMPLOYEE |
| GET/POST/PATCH/DELETE | `/locations` | COMPANY_ADMIN, HR_MANAGER | GET: all tenant roles |
| GET/POST/PATCH/DELETE | `/departments` | COMPANY_ADMIN, HR_MANAGER | GET: all tenant roles |
| GET/POST/PATCH/DELETE | `/teams` | COMPANY_ADMIN, HR_MANAGER | GET: all tenant roles |

**Tree response shape** (location-centric — must match FE):
```json
[
  {
    "id": 1,
    "name": "Colombo Head Office",
    "departments": [
      {
        "id": 1,
        "name": "Human Resources",
        "teams": [{ "id": 1, "name": "Recruitment", "_count": { "employees": 3 } }]
      }
    ]
  }
]
```

Departments without a location appear under `"Unassigned Location"` (id: 0).

### 12.5 Implementation Status (step-by-step)

| Step | Task | Status | Files |
|------|------|--------|-------|
| 1 | Prisma models: Location, Department, Team + tenantId | ✅ Done | `prisma/schema.prisma` |
| 2 | Backend CRUD + tree API | ✅ Done | `src/organisation/*` |
| 3 | Tree API returns location-centric shape for FE | ✅ Done | `organisation.service.ts` → `getTree()` |
| 4 | FE page: Tree / Locations / Departments / Teams tabs | ✅ Done | `FE/pages/organisation/*` |
| 5 | FE create forms (Company Admin only) | ✅ Done | `organisation-page.component.*` |
| 6 | FE update/delete for locations, departments, teams | ✅ Done | `organisation.service.ts`, `organisation-page.component.*` |
| 7 | Wire employee FK fields (departmentId, teamId, locationId) | ✅ Done | `src/employees/*`, `employees-page.component.*` |
| 8 | Department manager assignment (managerId FK + validation + picker UI) | ✅ Done | `prisma/schema.prisma`, `organisation.service.ts`, `FE/pages/organisation/*` |
| 9 | Delete safeguards (block if employees assigned) | ✅ Done | `organisation.service.ts` |
| 10 | `organisation.manage` permission in seed catalog | ✅ Done | `prisma/seed.ts` |
| 11 | Sample org seed data per demo tenant | ✅ Done | `prisma/seed.ts` |

### 12.6 Rules for AI Agents Working on Org Module

1. **Never bypass tenantId** — all queries must scope to `user.tenantId`
2. **Do not expose cross-tenant data** — validate location/department ownership before linking
3. **Keep tree shape stable** — FE expects `locations[].departments[].teams[]._count.employees`
4. **Company Admin is the UI owner** — route guard: `roles: ['COMPANY_ADMIN']` on `/organisation`
5. **Employee linking is step 7** — until then, `employee.department` string field still works for legacy display
6. **One module at a time** — finish org CRUD + employee linking before payroll/leave org reporting

### 12.7 Quick Verification (Company Admin)

1. Login as Company Admin with correct `companyCode`
2. Open `/organisation` — sidebar shows Organisation menu
3. Create a Location → Create a Department (select location) → Create a Team (select department)
4. Switch to **Tree** tab — hierarchy renders under the location name with team employee counts
5. Confirm another tenant's admin cannot see this tenant's org data (tenant isolation)

---

## 15) Recent Additions (BRD Gap-Fill)

### 15.1 Employee Date of Birth
- `dateOfBirth DateTime?` added to `Employee` model in `prisma/schema.prisma`.
- `UpdateEmployeeDto` accepts optional `dateOfBirth` string (ISO date).
- `employees.service.ts` update method persists DOB.
- Used by `dashboard.service.ts` `getUpcomingBirthdays()` for employee view team birthdays.
- Run `yarn prisma db push` after pull to apply schema changes.

### 15.2 Leave Presets — Paternity Removed
- `SRI_LANKA_LEAVE_POLICIES` in `src/leave/leave.constants.ts` no longer includes Paternity.
- Default policies are: Annual, Casual, Sick, Medical, Maternity.
- Existing tenant data is not affected (policy is only seeded on new tenants or empty tenants).

### 15.3 Dashboard — BRD 6.1 Gap-Fill
- `companyAdminMetrics()` now returns real data:
  - `monthlyBurnRate` — gross payroll sum for current month (COMPLETED runs)
  - `attendancePct` — today's clock-ins / total employees × 100
  - `leaveTrendSeries` — approved leave count per month (last 7 months)
  - `recentHires` — last 5 employees by joinedDate
  - `recruitmentFunnel` — candidate counts by pipeline stage
- `employeeMetrics()` now returns `teamBirthdays` (colleagues with DOB in next 30 days) and `upcomingHolidays` (next 5 Sri Lanka public holidays).

### 15.4 Organisation — Department Manager Assignment
- `Department` model now has FK relation `manager Employee?` on `managerId`.
- `Employee` model has reverse `managedDepartments Department[]`.
- `organisation.service.ts` validates manager belongs to the same tenant.
- `findAllDepartments`, `createDepartment`, `updateDepartment`, `getTree` all include manager info.
- Tree node includes `managerId` and `managerName` fields.

### 15.5 Attendance Settings — Late/Early Config
- New `AttendanceSettings` model (`attendance_settings` table) per tenant.
- Fields: `workStartTime`, `workEndTime`, `lateArrivalGraceMinutes`, `lateArrivalAction`, `earlyDepartureGraceMinutes`, `earlyDepartureAction`.
- `GET /api/attendance/settings` — returns (or auto-creates) tenant attendance settings.
- `PATCH /api/attendance/settings` — updates settings (COMPANY_ADMIN / HR_MANAGER only).
- Actions: `FLAG` (default), `DEDUCT`, `WARN`.

---

## 13) Operational Rules (Latest)
These are enforced behaviors and should not be regressed:

- Public signup flow:
  - `POST /api/auth/signup` creates tenant lead in pending approval flow.
  - Signup defaults: `subscriptionPlan=FREEMIUM`, `leadStatus=PENDING`, approval required.

- Tenant suspension messaging:
  - If tenant is pending lead approval, login message must indicate pending super admin approval.
  - If tenant is truly suspended after conversion, login message must indicate payment-related suspension.

- Leave and attendance role behavior:
  - `HR_MANAGER` / `TEAM_LEAD` / `EMPLOYEE` module access comes from **assigned tenant module roles**, not the job title alone.
  - `HR_MANAGER` can view and approve/reject leave only when assigned `LEAVE` (or equivalent permissions).
  - `TEAM_LEAD` can approve/reject leave only for direct reports when assigned `LEAVE`.
  - Attendance listing should include employee identity details (`employee.user`) for FE rendering.

- Employee deletion policy:
  - `COMPANY_ADMIN` can delete tenant users except `COMPANY_ADMIN` targets.
  - Only `SUPER_ADMIN` can delete a `COMPANY_ADMIN` user.
  - Deletion endpoint authorization includes `SUPER_ADMIN` and `COMPANY_ADMIN`; service enforces target-role restriction.

