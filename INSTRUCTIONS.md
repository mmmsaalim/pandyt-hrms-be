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
- `src/common` - guards, decorators, tenant enforcement
- `src/prisma` - Prisma service + tenant middleware
- `prisma/schema.prisma` - DB schema
- `prisma/seed.ts` - idempotent seed

## 4) Role Model (Current)
- `SUPER_ADMIN`: platform tenant lifecycle only
- `COMPANY_ADMIN`: full tenant operations
- `HR_MANAGER`: tenant-wide HR operations
- `TEAM_LEAD`: scoped team operations (direct reports)
- `EMPLOYEE`: self-scoped operations

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
| 8 | Department manager assignment (managerId validation + UI) | ⏳ Next | schema has field, no FK relation yet |
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

## 13) Operational Rules (Latest)
These are enforced behaviors and should not be regressed:

- Public signup flow:
  - `POST /api/auth/signup` creates tenant lead in pending approval flow.
  - Signup defaults: `subscriptionPlan=FREEMIUM`, `leadStatus=PENDING`, approval required.

- Tenant suspension messaging:
  - If tenant is pending lead approval, login message must indicate pending super admin approval.
  - If tenant is truly suspended after conversion, login message must indicate payment-related suspension.

- Leave and attendance role behavior:
  - `HR_MANAGER` can view and approve/reject leave within tenant.
  - `TEAM_LEAD` can approve/reject leave only for direct reports.
  - Attendance listing should include employee identity details (`employee.user`) for FE rendering.

- Employee deletion policy:
  - `COMPANY_ADMIN` can delete tenant users except `COMPANY_ADMIN` targets.
  - Only `SUPER_ADMIN` can delete a `COMPANY_ADMIN` user.
  - Deletion endpoint authorization includes `SUPER_ADMIN` and `COMPANY_ADMIN`; service enforces target-role restriction.

