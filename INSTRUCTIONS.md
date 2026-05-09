# BE Instructions (FlowHR)

## Stack
- NestJS + Prisma + PostgreSQL
- API prefix: `/api`
- Auth: JWT Bearer

## Core Multi-Tenant Rules
- `SUPER_ADMIN` can onboard companies (tenants) and manage tenant lifecycle.
- `COMPANY_ADMIN` can manage only users/employees within the same tenant.
- `EMPLOYEE` is self-scoped for employee data.
- Tenant scoping is enforced via `tenantId` (`company_id`) relations.

## Invitation-Based Onboarding

### Super Admin
- Endpoint: `POST /api/tenants/onboard`
- Payload:
  - `companyName`
  - `adminName`
  - `adminEmail`
  - `subscriptionPlan`
  - `seats` (optional)
- Behavior:
  - Creates tenant
  - Creates Company Admin user in `PENDING`
  - Assigns `COMPANY_ADMIN` role
  - Creates invitation with expiring one-time token
  - Sends invitation email with set-password link

### Company Admin
- Endpoint: `POST /api/employees/invite`
- Payload:
  - `name`
  - `workEmail`
  - `department`
  - `designation`
  - `role` (`EMPLOYEE` or `COMPANY_ADMIN`)
  - `employeeCode` (optional)
- Behavior:
  - Creates user in `PENDING`
  - Assigns requested role
  - Creates employee profile in same tenant
  - Creates invitation and sends email

### Invitation Acceptance
- Resolve invitation: `GET /api/invitations/resolve?token=...`
- Accept invitation: `POST /api/invitations/accept`
  - body: `{ token, password }`
- On accept:
  - validates token
  - checks expiry and one-time status
  - hashes password
  - activates user (`status=ACTIVE`)
  - marks invitation accepted

## Security Requirements
- Invitation tokens are one-time and expiring (`INVITATION_EXPIRY_HOURS`, default 24).
- Login denies non-active users.
- Passwords are hashed with bcrypt.
- Company-scoped operations must validate tenant match.

## Prisma Models
- `Tenant` (company)
- `User` (includes optional `tenantId`)
- `Invitation`
- `Employee`, `Role`, `UserRole`, etc.

## Free Email Provider (Current)
- `EmailService` supports Brevo API (free tier) if `BREVO_API_KEY` is configured.
- If key is missing, service logs invitation link to server logs for development.

## Required Environment Variables
- `DATABASE_URL`
- `JWT_SECRET`
- `APP_URL` (default `http://localhost:4200`)
- `INVITATION_EXPIRY_HOURS` (default `24`)
- `BREVO_API_KEY` (optional for real email sending)
- `MAIL_FROM` (optional)
- `MAIL_FROM_NAME` (optional)

## Dev Commands
- `yarn prisma:generate`
- `yarn prisma:migrate`
- `yarn prisma:seed`
- `yarn start:dev`
- `yarn build`
