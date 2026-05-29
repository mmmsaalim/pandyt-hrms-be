# FlowHR API (NestJS + Prisma)

## Setup

```bash
yarn install
copy .env.example .env
yarn prisma:generate
# Run the following after PostgreSQL is ready:
# yarn prisma:migrate
# yarn prisma:seed
# yarn start:dev
```

## DB Later Flow

- You can complete project setup before DB is available.
- Once DB is connected, run migrate then seed.
- Seed is idempotent and safe to rerun.
- API can boot without `DATABASE_URL` in DB-later mode, but DB-backed endpoints will fail until DB is configured.

## API Base

`http://localhost:3000/api`

## Key Security

- Role is separated from user table.
- Role mapping uses `UserRole`.
- Access checks handled in backend guards.

## Modules

- auth
- users
- roles
- tenants
- employees
- leave
- attendance
- payroll
- payslips
- recruitment
- reports
- dashboard
