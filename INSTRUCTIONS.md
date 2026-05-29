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
- Organisation tree and location/department/team CRUD
- Leave workflows: apply, approve/reject, balances, policies, accrual
- Attendance workflows: clock-in/out and HR override
- Statutory payroll processing (EPF/ETF/PAYE) and payslip generation
- Dashboard and reports core role-based data
- Role activation in app logic: `HR_MANAGER` and `TEAM_LEAD`

Key role-invite endpoint:
- `POST /api/employees/invite`
- Accepted roles: `EMPLOYEE | TEAM_LEAD | HR_MANAGER | COMPANY_ADMIN`
- Creator policy:
  - `COMPANY_ADMIN` can create all listed roles
  - `HR_MANAGER` can create `EMPLOYEE`, `TEAM_LEAD`, `HR_MANAGER`

## 7) Next Scope (Planned)
Planned next roadmap items:
- AI resume parsing and candidate scoring
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
- `BREVO_API_KEY` (optional)
- `MAIL_FROM` (optional)
- `MAIL_FROM_NAME` (optional)

Dev commands:
- `yarn prisma:generate`
- `yarn prisma:migrate`
- `yarn prisma:seed`
- `yarn start:dev`
- `yarn build`

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

