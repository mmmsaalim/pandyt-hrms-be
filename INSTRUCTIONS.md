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
- Tenant model: strict tenant isolation using `tenantId`. Scoping is derived **only** from the JWT-verified `request.user.tenantId` (via `TenantContextInterceptor`) — `X-Tenant-ID` is a secondary consistency check (`JwtStrategy`), never the source of truth for query scoping. See §16.7.
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
- `src/reports` - platform report (super admin, tenant/plan/user-count only — no per-tenant user detail) + tenant-scoped reports (employees/leave/attendance/payroll, date-range + Excel export)
- `src/recruitment` - ATS core entities/endpoints
- `src/invitations` - resolve and accept invitation flow
- `src/letters` - HR letter generation (included on all plans; not a billable module toggle)
- `src/feedback` - team feedback capture for HR review (included on all plans)
- `src/common` - guards, decorators, tenant enforcement
- `src/prisma` - Prisma service + tenant `$extends` extension
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
- HttpOnly cookie auth session (`flowhr_access_token`, 8 hours)
- `X-Tenant-ID` enforcement against JWT `tenantId`
- Prisma 6 tenant extension (`$extends`) + service-level tenant checks
- Cross-tenant access rejection
- One-time expiring invitation token flow (default 24h)
- Password reset tokens hashed (SHA-256), default 24h expiry
- Rate limiting on login, signup, password reset, invitation public endpoints
- JWT secret strength validation on server startup
- Security response headers (X-Content-Type-Options, X-Frame-Options, Referrer-Policy)
- Configurable CORS via `CORS_ORIGINS` env

**Token timings**
| Token | Default |
|---|---|
| JWT access | 8 hours (480 min) |
| Password reset | 24 hours (`PASSWORD_RESET_EXPIRY_HOURS`) |
| Invitation | 24 hours (`INVITATION_EXPIRY_HOURS`) |

**Rate limits (per IP, 15 min window)**
| Endpoint | Limit |
|---|---|
| `POST /api/auth/login` | 10 |
| `POST /api/auth/signup` | 5 |
| `POST /api/auth/password/reset/*` | 5 |
| `GET/POST /api/invitations/resolve|accept` | 20 / 10 |

See **Section 16** for Postman testing and full security instructions.

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
- `JWT_SECRET` (32+ chars; server warns in dev, fails in production if weak)
- `APP_URL`
- `CORS_ORIGINS` (comma-separated FE URLs)
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
- Tenant-scoped query results follow the JWT's `tenantId`, not any client-supplied header value (see §16.7) — cannot be verified by header manipulation alone; requires checking the Prisma extension's actual context source

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
- `AttendanceSettings` model per tenant with full settings JSON (schedule, late, early, OT, payroll integration, shifts, holidays).
- SaaS pay modes: salary-based or fixed LKR for late, early, and OT.
- Configurable `workingDaysPerMonth` and `standardHoursPerDay` for payroll formulas.
- Connected to payroll: `attendanceDeduction` + OT allowance on payslips.

---

## 16) Security Hardening (Multi-Tenant SaaS)

Read this before API testing (Postman), production deploy, or security reviews.

### 16.1 Architecture

```
Request → CORS + security headers (Express middleware, main.ts)
       → JwtAuthGuard (JwtStrategy: verifies JWT; for non-SUPER_ADMIN, rejects if
                        X-Tenant-ID header doesn't match the JWT's tenantId)
       → RolesGuard / PermissionsGuard / ModuleEnabledGuard  (read request.user.tenantId directly)
       → TenantContextInterceptor  (sets AsyncLocalStorage tenantId = request.user.tenantId — JWT-derived, NEVER the header)
       → Prisma tenant extension ($extends) auto-scopes tenant models from that context
       → service-level tenantId checks (defense in depth)
```

**Files**
- `src/common/interceptors/tenant-context.interceptor.ts` — establishes the tenant-scoping context strictly from `request.user.tenantId` (see §16.7)
- `src/prisma/prisma-tenant.extension.ts` — auto-injects `tenantId` on tenant models from that context
- `src/common/security/validate-security-config.ts` — JWT secret validation
- `src/common/security/rate-limit.service.ts` + `RateLimitGuard`
- `src/auth/jwt.strategy.ts` — cookie or Bearer token + tenant header match (secondary check, not the scoping source)

### 16.2 Postman / API Tool Testing

1. `POST /api/auth/login` with `{ email, password, companyCode }`
2. Copy `accessToken` and `user.tenantId` from response
3. Every protected call:
   - `Authorization: Bearer <accessToken>`
   - `X-Tenant-ID: <tenantId>`
4. Expected failures:
   - Missing/invalid JWT → **401**
   - Wrong `X-Tenant-ID` → **401 Tenant header mismatch**
   - Wrong role → **403**
   - Rate limit exceeded → **429**

### 16.3 Production Checklist

- [ ] Set strong `JWT_SECRET` (32+ random characters)
- [ ] `NODE_ENV=production`
- [ ] `CORS_ORIGINS` = production FE URL(s) only
- [ ] `APP_URL` uses HTTPS
- [ ] Never commit `.env`

### 16.4 Rules for AI Agents

1. All tenant business queries must scope by `tenantId` (extension + service check).
2. Never bypass `JwtAuthGuard` on tenant data endpoints.
3. `SUPER_ADMIN` bypasses tenant header check — protect cross-tenant routes with `@Roles('SUPER_ADMIN')` only.
4. Public routes: auth login/signup/reset, invitation resolve/accept, public careers — rate limited.
5. **Never make `TenantContext`/the Prisma tenant extension read anything client-supplied** (headers, query params, body fields). It must only ever be populated from `request.user.tenantId` set by the verified JWT. See §16.7 for why.

### 16.7 Fix (2026-07-24): Tenant context was sourced from a trusted client header, not the JWT

**Severity:** Critical — real, exploitable cross-tenant data-isolation bypass (distinct from the July 20 "Fix #1" in §17, which was about model *coverage* in `TENANT_MODELS`, not the *source* of the tenant ID).

**What was wrong:**
- `main.ts` (Express middleware, ran before any Nest guard) read the raw `X-Tenant-ID` request header and stored it in `AsyncLocalStorage` via `TenantContext.run(...)`.
- `prisma-tenant.extension.ts` read that value and injected it into `where.tenantId` / `data.tenantId` for every query on `TENANT_MODELS`, **overwriting** any `tenantId` a service had already resolved (`{...where, tenantId}` — context value applied last).
- `JwtStrategy.validate()` does reject non-`SUPER_ADMIN` requests where `X-Tenant-ID` doesn't match the JWT's `tenantId` — but that check runs **after** the header was already latched into context, and only for guarded/authenticated routes. Any route not behind `JwtAuthGuard` (public endpoints) still had the header committed to context with zero verification, so a Prisma `create`/`data` write relying on context (rather than an explicit tenantId passed by the service) could be silently misattributed to whatever tenant a caller named in the header, unauthenticated.
- Net effect: the ORM-level tenant boundary — the thing §9.3/§19.4 of the BRD calls the single most critical line of code for security — was ultimately trusting client input, not the authenticated session, as its defense-in-depth backstop.

**Fix:**
- Removed the `X-Tenant-ID`-reading middleware from `main.ts` entirely.
- Added `src/common/interceptors/tenant-context.interceptor.ts`, registered globally via `APP_INTERCEPTOR` in `app.module.ts`. It runs after Guards (Nest order: Guards → Interceptors → Pipes → Handler), so `request.user` is already populated by `JwtAuthGuard`/`JwtStrategy` by the time it executes. It wraps `next.handle()` in `TenantContext.run(request.user?.tenantId ?? null, ...)`.
- Result: `TenantContext.getTenantId()` — and therefore every Prisma tenant-scoped query — now derives **exclusively** from the verified JWT. For unauthenticated/public routes (`request.user` is `undefined`), context is `null` and the extension no-ops, exactly as before for those paths; public services (e.g. recruitment's public apply flow) already resolve their own tenant explicitly (via `companyCode`) and are no longer at risk of having that value silently overwritten.
- `JwtStrategy`'s header-mismatch check is left in place — it's now a harmless secondary consistency check, not a load-bearing security control.

**Files changed:** `src/main.ts`, `src/app.module.ts`, `src/common/interceptors/tenant-context.interceptor.ts` (new). No schema/migration changes, no API contract changes.

**How to verify:** as an authenticated non-super-admin user, sending a mismatched `X-Tenant-ID` still gets rejected at the guard (401, unchanged). More importantly: even if that guard check were ever removed or had a bug, Prisma scoping itself no longer reads the header at all — verify by temporarily stubbing `JwtStrategy` to skip the header check and confirming query results still follow `request.user.tenantId`, not whatever header value is sent.

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

---

## 17) Codebase Audit Findings & Implementation Status (Code Quality & Maintainability)

This section documents a complete audit of the codebase (July 2026) and tracks implementation of critical fixes. **All future work must follow these standards.**

### 17.0 Implementation Status — Fixes Completed (July 2026)

The following critical fixes have been **implemented and committed**:

✅ **Fix #1: Tenant-Isolation Model Gap (CRITICAL)** — COMPLETED
- **File:** `src/prisma/prisma-tenant.extension.ts:4-28`
- **Change:** Added 9 missing tenant-scoped models to `TENANT_MODELS` set
  - `JobPost`, `HrLetter`, `HrFeedback`, `CanteenSettings`, `CanteenMealEntry`
  - `TenantBillingSettings`, `TenantModuleSetting`, `TenantFieldSetting`, `BillingReminderDispatch`
- **Impact:** Cross-tenant data leak risk eliminated. All tenant business models now have automatic Prisma `$extends` protection.
- **How to verify:** Prisma will auto-scope all queries on these 9 models by `tenantId`; manual checks no longer needed.

✅ **Fix #2: Hardcoded Brand Name (Live User-Facing Bug)** — COMPLETED
- **Files:** `src/common/constants/app.constant.ts` (NEW) + `src/email/email.service.ts`, `src/email/email.templates.ts`, `src/invitations/invitations.service.ts`
- **Changes:**
  - Created `src/common/constants/app.constant.ts` with `APP_BRAND_NAME='Pandyt HRMS'`, `APP_BRAND_EMAIL_DOMAIN`, `APP_BRAND_SUPPORT_EMAIL`
  - Replaced 8 hardcoded "Pandyt HR Cloud" and "pandyt.local" strings with constant imports
- **Impact:** User-facing email branding now consistent across all modules. Single source of truth.
- **How to verify:** All emails will now say "Pandyt HRMS" consistently.

✅ **Fix #3: Role Constants Centralization** — COMPLETED
- **File:** `src/common/constants/roles.constant.ts` (NEW)
- **Changes:** Created comprehensive role groupings for all modules
  - 5 global identity roles: `SUPER_ADMIN`, `COMPANY_ADMIN`, `HR_MANAGER`, `TEAM_LEAD`, `EMPLOYEE`
  - 40+ named role groupings by module (`EMPLOYEES_WRITE_ROLES`, `LEAVE_APPROVE_ROLES`, etc.)
  - 5 helper functions: `isSuperAdmin()`, `isCompanyAdmin()`, `isAdmin()`, `isManager()`, `isTenantRole()`
- **Impact:** Single source of truth for RBAC. Next step: refactor ~130 `@Roles(...)` decorators across controllers to use these exports.
- **Next task:** Replace inline role arrays like `@Roles('COMPANY_ADMIN', 'HR_MANAGER')` with `@Roles(...EMPLOYEES_WRITE_ROLES)` (mechanical refactor, ~2 hours).

⏳ **Fix #4: RBAC Module-Role Bootstrap Deduplication** — IN PROGRESS
- **Scope:** Extract one `RoleBootstrapService` shared by 3 implementations (tenants, roles, employees)
- **Files affected:** `src/tenants/tenants.service.ts:185-224`, `src/roles/roles.service.ts:210-260`, `src/employees/employees.service.ts:228-270`
- **Effort:** 1-2 hours. Create `src/roles/role-bootstrap.service.ts`, call from all 3 sites.
- **Priority:** High (live RBAC inconsistency). Can be completed independently.

⏳ **Fix #5: Tenant-Ownership Check Utility** — IN PROGRESS
- **Scope:** Extract hand-rolled `findFirst({id, tenantId}) → throw` checks (40+ occurrences) into one `TenantScopedRepository`
- **Files affected:** 15+ services across the codebase
- **Effort:** 2-3 hours. Create `src/common/tenant-scoped.repository.ts`, refactor one module at a time.
- **Priority:** High (copy-paste leak risk, affects consistency). Can be done incrementally per module.

**Note on Fixes #4-5:** These are large refactors touching many files. They are designed (constants and helpers ready), but require mechanical application across the codebase. Provided below: clear implementation checklists and code templates.

✅ **Fix #6: Tenant Context Sourced From Client Header, Not JWT (CRITICAL — cross-tenant bypass)** — COMPLETED 2026-07-24
- **Files:** `src/main.ts`, `src/app.module.ts`, `src/common/interceptors/tenant-context.interceptor.ts` (new)
- **Change:** Tenant scoping context (consumed by the Prisma `$extends` extension) is now populated exclusively from the JWT-verified `request.user.tenantId`, via a global `TenantContextInterceptor`, instead of the raw `X-Tenant-ID` request header read by Express middleware before any auth check ran.
- **Impact:** Closes a real cross-tenant data-isolation bypass — previously, the ORM-level tenant boundary trusted a client-controlled header rather than the authenticated session. Distinct from Fix #1 above (which fixed *model coverage* in `TENANT_MODELS`, not the *source* of the tenant ID itself).
- **Full detail:** See §16.7.

### 17.1 Critical Findings (Must Fix)

#### Finding 1: Tenant-Isolation Model Gap (CRITICAL — Cross-Tenant Leak Risk)

**Issue:** `src/prisma/prisma-tenant.extension.ts` line 4 defines `TENANT_MODELS` set with 14 models, but **9 tenant-scoped models are missing**:
- `JobPost`, `HrLetter`, `HrFeedback`, `CanteenSettings`, `CanteenMealEntry` (from recruitment and canteen modules)
- `TenantBillingSettings`, `TenantFieldSetting`, `TenantModuleSetting`, `BillingReminderDispatch` (from platform configuration)

**Why it matters:** Prisma's `$extends` tenant middleware does **not** auto-inject `tenantId` on these models. Any endpoint touching them relies entirely on **manual per-service ownership checks**. A single missed check allows cross-tenant data exposure.

**Current mitigation:** Services like `letters.service.ts`, `recruitment.service.ts` currently do manual `findFirst({id, tenantId})` before update/delete, but this is error-prone and not enforced by the framework.

**Fix:** Add all 9 missing models to `TENANT_MODELS` set in `prisma-tenant.extension.ts:4-19`. Test: write a schema-level invariant that fails CI if a model has `tenantId` but isn't in the set.

**Ownership:** Critical security fix — prioritize before any production release.

---

#### Finding 2: Hardcoded Brand Name (Live User-Facing Bug)

**Issue:** "Pandyt HR Cloud" and "pandyt.local" hardcoded in 3 files:
- `src/email/email.service.ts:66,70` (fallback email from-address, from-name)
- `src/email/email.templates.ts:11,23,87,92` (brand constant, reset password subject/body, email footer)
- `src/invitations/invitations.service.ts:172,249` (fallback company name in token emails)

**Problem:** BRD establishes product name as "**Pandyt HRMS**". But:
- Backend cookie is `flowhr_access_token` (contradicts auth setup)
- Email templates hardcode "Pandyt" instead of reading from config or constant
- Real users receive emails branded "Pandyt" — inconsistent with internal naming

**Fix:** 
1. Create `src/common/constants/app.constant.ts` with `export const APP_BRAND_NAME = 'Pandyt HRMS';`
2. Replace all 8 hardcoded "Pandyt" strings with reference to this constant
3. Add `APP_BRAND_NAME` to `.env` and `.env.example` as optional override for white-label deployments

**Ownership:** User-facing bug — fix in next release cycle.

---

#### Finding 3: JWT Token TTL Defined Twice (Consistency/Drift Risk)

**Issue:** JWT session lifetime defined in two places with different formats:
- `src/auth/auth.module.ts:23` — `JwtModule.register({ secret, expiresIn: '8h' })`
- `src/auth/auth.controller.ts:27` — cookie `maxAge: 1000*60*60*8` (ms, equals 8h)

**Problem:** If only one is changed (e.g., to 12h), the other remains at 8h. Users experience either:
- "Your session is expired" (JWT expired but cookie still valid) — confusing UX
- "Invalid token" (cookie expired but JWT claims 8h validity) — security risk

**Fix:**
```typescript
// src/common/constants/auth.constant.ts
export const AUTH_TOKEN_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
export const AUTH_TOKEN_TTL_STR = '8h'; // NestJS JwtModule format

// src/auth/auth.module.ts
expiresIn: AUTH_TOKEN_TTL_STR

// src/auth/auth.controller.ts
res.cookie('flowhr_access_token', token, {
  maxAge: AUTH_TOKEN_TTL_MS,
  ...
})
```

**Ownership:** Medium priority — prevents future bugs when session length changes.

---

#### Finding 4: PAYE Tax Brackets Hardcoded (Inconsistent Centralization)

**Issue:** `src/payroll/payroll.service.ts:24-40` defines PAYE tax brackets **inline**:
```typescript
if (taxableIncome > 6000000) return 6000000 * 0.36 + (taxableIncome - 6000000) * 0.36; // etc.
```

But on the same lines, EPF/ETF rates correctly import from `src/payroll/sri-lanka-statutory.constants.ts`:
```typescript
const epfEmployee = (basicPay * SL_EPF_EMPLOYEE_RATE) / 100; // imports from constants
```

**Problem:** Annual IRD PAYE bracket updates require editing business logic instead of centralized constants. Inconsistent with team's stated pattern (see how `SL_EPF_*`/`SL_ETF_*` are already centralized).

**Fix:** Move PAYE brackets to `src/payroll/sri-lanka-statutory.constants.ts`:
```typescript
export const SL_PAYE_BRACKETS = [
  { threshold: 1200000, rate: 0.06 },
  { threshold: 1800000, rate: 0.12 },
  // ... all 6 brackets
];
```
Then call a `calculatePayeTax(taxableIncome)` helper that references this constant.

**Ownership:** Medium priority — improves maintainability for statutory updates.

---

### 17.2 High-Impact Duplication Issues

#### Issue 1: RBAC Module-Role Bootstrap Reimplemented 3× with Drifting Rules

**Location:** 
- `src/tenants/tenants.service.ts:185-224` (onboarding)
- `src/roles/roles.service.ts:210-260` (role service bootstrap)
- `src/employees/employees.service.ts:228-270` (employee invite)

**Pattern:** All three reimplement: "group enabled modules → find-or-create Role per module → sync RolePermission records"

**Problem:** Exclusion rules **drift** between copies:
- Onboarding excludes `configuration` + `tenants` modules from bootstrap
- `roles.service` excludes only `configuration`
- `employees.service` excludes neither — bootstraps all modules

**Impact:** A tenant onboarded via super-admin gets different module-role permission sets than an employee invited later, even for the same enabled modules. Any RBAC bugfix must be applied 3× with risk of missing one.

**Fix:** Extract one shared `RoleBootstrapService` with a single `syncModuleRoles(tx, tenantId, enabledModules)` method. Call from all 3 sites within a transaction. Establish exclusion rules once, document in constants.

**Ownership:** High priority — is a live RBAC inconsistency, not just technical debt.

---

#### Issue 2: Tenant-Ownership Checks Hand-Rolled 40+ Times

**Pattern:** Almost every service reimplements:
```typescript
const item = await prisma.model.findFirst({ where: { id, tenantId } });
if (!item) throw new NotFoundException('...');
```

Occurs in: `organisation.service.ts` (6×), `employees.service.ts`, `leave.service.ts`, `attendance.service.ts`, `payslips.service.ts`, `payroll.service.ts`, `roles.service.ts`, `canteen.service.ts`, `recruitment.service.ts`, `letters.service.ts`, `feedback.service.ts`, plus more.

**Problem:** 
- Copy-paste error risk (forgot tenantId check in one place = cross-tenant leak)
- Inconsistent error messages ("not found" vs. "not found in this tenant")
- Impossible to globally audit or patch (e.g., exclude soft-deleted items from scope)

**Fix:** Create a shared utility `TenantScopedRepository`:
```typescript
// src/common/tenant-scoped.repository.ts
export class TenantScopedRepository {
  async requireTenantOwned(model, id, tenantId, notFoundMsg?) {
    const item = await this.prisma[model].findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException(notFoundMsg ?? `${model} not found`);
    return item;
  }
}

// Usage everywhere:
const org = await this.tenantRepo.requireTenantOwned('organisation', id, tenantId);
```

**Ownership:** High priority — easiest high-impact refactor (replace 40+ locations, reduce boilerplate, improve consistency).

---

#### Issue 3: `getEmployeeContext()` and `hasRole()` Duplicated Across 4 Services

**Location:** `employees.service.ts:221`, `payslips.service.ts:16`, `leave.service.ts:142`, `attendance.service.ts:30`

**Pattern:** All four define identical:
```typescript
const emp = await prisma.employee.findUnique({
  where: { userId },
  select: { id, tenantId }
});
const hasRole = user.roles?.includes('ROLE_NAME');
```

**Problem:** Future guard (e.g., "exclude soft-deleted employees") patched in 3 of 4 places silently lets a stale session act in the 4th.

**Fix:** One shared `EmployeeContextService`:
```typescript
// src/common/employee-context.service.ts
export class EmployeeContextService {
  async getEmployeeContext(userId: number) { /* once */ }
  hasRole(user, role: string) { /* once */ }
}
```

**Ownership:** Medium priority — consolidates frequently-used lookups, improves consistency.

---

### 17.3 High-Volume Boilerplate

#### Issue: `@Roles(...)` Role Arrays Retyped ~130+ Times

**Pattern:** Every controller method decorates with role arrays:
```typescript
@Post('/employees')
@Roles('COMPANY_ADMIN', 'HR_MANAGER')
async create() { ... }

@Patch('/employees/:id')
@Roles('COMPANY_ADMIN', 'HR_MANAGER')
async update() { ... }
```

Role arrays (`['COMPANY_ADMIN', 'HR_MANAGER']`, `['EMPLOYEE', 'TEAM_LEAD']`, etc.) retyped at every call site.

**Reference:** `src/recruitment/recruitment.controller.ts:29` already extracts a local `RECRUITMENT_ROLES` constant — proving the team recognizes this pattern but never generalized it.

**Fix:** Create `src/common/constants/roles.constant.ts`:
```typescript
export const ADMIN_ROLES = ['SUPER_ADMIN', 'COMPANY_ADMIN'];
export const HR_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER'];
export const TENANT_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD', 'EMPLOYEE'];
export const MANAGER_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD'];
export const ALL_ROLES = ['SUPER_ADMIN', ...TENANT_ROLES];

// export named groups for each module:
export const RECRUITMENT_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER'];
export const PAYROLL_ROLES = ['COMPANY_ADMIN'];
export const LEAVE_ROLES = ['COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD', 'EMPLOYEE'];
// ... etc per module
```

Then refactor all ~130 `@Roles(...)` decorators to reference these constants. Type-safe and maintainable.

**Ownership:** High volume, low risk — invest in this after critical fixes (1-4).

---

### 17.4 Configuration & Env Var Gaps

**Issue:** `.env.example` missing several documented env vars:
- `EMAIL_PROVIDER`, `EMAIL_FAIL_FAST`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- `RESEND_API_KEY`, `BREVO_API_KEY`
- `MAIL_FROM`, `MAIL_FROM_NAME`, `MAIL_SUPPORT_EMAIL`

All are documented in `INSTRUCTIONS.md` Section 8 and read in code (`email.service.ts`, `invitations.service.ts`), but new environment setup has no template.

**Fix:** Add all missing vars to `.env.example` with comments explaining each.

**Ownership:** Low priority — QOL improvement for onboarding new developers.

---

### 17.5 Going Forward: Conventions for AI Agents & Code Reviews

**Rule 1: Never add a hardcoded value that appears more than once.**
- First use: literal is OK.
- Second use: extract to `src/common/constants/*` or `.env`.
- Applies to: role names, status strings, defaults (page size, token expiry), currency/locale, file limits, etc.

**Rule 2: Tenant-ownership checks use the shared `TenantScopedRepository` utility, never hand-rolled.**
- Pattern: `await this.tenantRepo.requireTenantOwned(model, id, tenantId)` (one line)
- Goal: Every instance is identical; future audits can grep and verify completeness.

**Rule 3: JWT/Auth constants centralized in `src/common/constants/auth.constant.ts`.**
- Covers: token TTL (both string and ms), cookie name, rate limits, reset/invitation expiry
- Update one place → all downstream code uses the update automatically.

**Rule 4: Role role-name literals and role-group arrays live in `src/common/constants/roles.constant.ts`.**
- Named exports: `ADMIN_ROLES`, `HR_ROLES`, `RECRUITMENT_ROLES`, etc.
- Every `@Roles(...)` decorator references one of these exports.
- Code review gate: reject `@Roles('HARDCODED', 'LITERAL')` — point to the constants file.

**Rule 5: RBAC bootstrap logic goes to one `RoleBootstrapService.syncModuleRoles()` method.**
- No reimplementation. Call from onboarding, role service, employee invite.
- Single transaction, single exclusion-rules list, single source of truth.

**Rule 6: All Prisma queries on tenant models must include `tenantId` scope or explicitly skip (e.g., global roles, SUPER_ADMIN queries).**
- Post-query: verify model is in `TENANT_MODELS` set or has a valid reason not to be.
- Code review gate: `findMany`, `findFirst`, `findUnique` on business models require `{ where: { ..., tenantId } }`.

**Rule 7: `.env.example` and `.env` must stay in sync.**
- After adding an env var to code, update `.env.example` with default and comment.
- Code review gate: env-var changes require `.env.example` update in same PR.

### 17.6 Quick Verification Checklist (For Code Review)

- [ ] No hardcoded role names — all use `src/common/constants/roles.constant.ts` exports?
- [ ] All tenant business queries scope by `tenantId`?
- [ ] No hand-rolled `findFirst({id, tenantId}) → throw` checks — all use `TenantScopedRepository`?
- [ ] JWT secret / token TTL / cookie config imported from `src/common/constants/auth.constant.ts`?
- [ ] RBAC bootstrap called via `RoleBootstrapService.syncModuleRoles()`, never reimplemented?
- [ ] New env vars added to `.env.example`?

---

## 18) AI Phases Roadmap (Future Scope)

Per BRD Section 7 and the codebase audit (July 2026), the following AI features are **designed but not yet implemented**. They align with Phases 3-4:

### 18.1 Phase 3: AI Resume Parsing & Candidate Scoring (Weeks 13-18)

**Status:** Recruitment module scaffolded (job posts, candidates, resume upload via multer). Resume upload stores file to `uploads/resumes/{tenantId}/` with DB ref in `candidate.resumeUrl`. **Parsing not yet implemented.**

**Planned Architecture (from BRD §7.4-7.5):**
- HR uploads 1-50 PDFs via `POST /recruitment/jobs/:jobId/resumes/batch`
- Backend enqueues jobs to Bull (Redis) queue — async, non-blocking
- Worker calls `Vertex AI text-embedding-005` to extract structured JSON: `{ name, email, phone, yearsExperience, topSkills }`
- Cosine similarity computed between job description embedding + resume embedding using pgvector
- Candidates returned ranked by AI score (0–100)

**Implementation Checklist:**
- [ ] Install `pdf-parse`, `@google-cloud/vertexai` npm packages
- [ ] Create `src/recruitment/resume-parser.service.ts` (Gemini 3.1 Flash extraction via Vertex AI)
- [ ] Create `src/recruitment/candidate-scorer.service.ts` (text-embedding-005 + pgvector cosine similarity)
- [ ] Migrate Prisma schema: add `ai_embedding vector(1536)`, `ai_extracted_data JSONB` to `Candidate`; enable pgvector extension on RDS
- [ ] Wire Bull worker queue: enqueue resume-parse jobs in controller, consume in worker
- [ ] Update `/recruitment/candidates` response to include `{ aiScore, aiExtractedData }`
- [ ] Add `ai_feedback_logs` table for model improvement tracking

**Estimated Effort:** 2 weeks (parsing + scoring + embeddings + pgvector setup)

---

### 18.2 Phase 4: AI Agents & Narrative Insights

**Status:** Designed (BRD §7.3), not implemented.

**Four Core Agents:**
1. **HR Analyst Agent** — cross-module workforce intelligence, weekly narrative digests
2. **Recruitment Agent** — end-to-end hiring orchestration (extend Phase 3), interview scheduling, offer drafting
3. **Performance Coach Agent** — evaluation summary drafting, bias detection, promotion readiness reports
4. **Compliance Watchdog Agent** — missing document alerts, EPF/ETF calculation audits, access permission violations

**Implementation Path:**
- Use LangChain + Vertex AI Gemini 3.1 Pro for multi-step reasoning
- Implement per-tenant AI credit quotas (`TenantAiCredits` model, tracked in `ai_feedback_logs`)
- Bull queue rate limiting: max 10 concurrent Vertex AI calls per tenant
- Caching layer for embeddings: hash job description → cache vector in Redis

**Estimated Effort:** 4-6 weeks (agents, scheduling, caching, quotas)

---

### 18.3 Real-Time Notifications (Partial; Email Core Exists)

**Status:** Email notifications working (`src/email/email.service.ts`). **Real-time (SSE / Socket.io) not yet implemented.**

**Scope:** Designed in BRD §6.8. Currently supports email; in-app notification bell + Slack webhook deferred.

**Future Implementation:**
- Add `notifications` table with type, recipient, read_at
- Socket.io connection per logged-in user
- Emit on events: leave approved, payslip ready, candidate stage change, probation alert
- Notification digest: group similar alerts, re-rank by urgency + role context

**Estimated Effort:** 2 weeks (Socket.io setup, event emitters, FE integration)

---

## 19) Reports & Tenant Communication (2026-07-24)

### 19.1 Platform Report privacy fix (Super Admin)

`GET /reports/platform/tenants` (and its FE page) previously had a "View users" action returning **other tenants' individual user names, emails, and roles** to Super Admin — a privacy problem in a multi-tenant SaaS product (Super Admin should see tenant/plan/user-*count*, not another company's user directory).

- Removed `platformTenantUsers` service method and its endpoint entirely.
- "View" now opens a popup with tenant-level summary only (plan, status, seats, active/inactive counts, employees) — no per-user data.
- Added `GET /reports/platform/tenants/export-excel?tenantIds=` (ExcelJS) — exports selected tenants, or all if none selected.

### 19.2 Tenant-scoped reports (Company Admin / HR Manager)

New endpoints under `/reports/tenant/*` — `employees`, `leave`, `attendance`, `payroll` — each accepting optional `from`/`to` query params and scoped strictly to `request.user.tenantId` (never client-supplied). Each has a matching `/export-excel` route. Full user/employee detail is shown here since it's the caller's own tenant. FE Reports page (non-super-admin) now has 4 tabs, a month-or-custom date-range picker, and per-tab Excel export — previously this page only showed 3 static counts.

### 19.3 Super Admin → tenant email

`POST /tenants/payments/:tenantId/email` — free-compose subject/message, delivered to the tenant's billing contacts (or Company Admin as fallback — same recipient resolution as the existing overdue-payment reminder). New template in `email.templates.ts` with HTML-escaping on the user-supplied message body. FE: "Send Email" button on the Company Payments page next to "Settings".

### 19.4 Removed `cross-tenant-reports` module

Deleted `src/cross-tenant-reports/*` (BE) and the matching FE page/service — it duplicated the platform report, had a hardcoded `localhost:3000` API URL, and exposed CSV/PDF export routes the backend never implemented. Confirmed unreferenced by any route/nav before removal.

---

