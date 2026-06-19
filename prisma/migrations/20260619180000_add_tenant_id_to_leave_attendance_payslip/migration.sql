-- Add tenantId to LeaveRequest, Attendance, and Payslip for tenant-scoped queries.

ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

UPDATE "LeaveRequest" lr
SET "tenantId" = e."tenantId"
FROM "Employee" e
WHERE lr."employeeId" = e.id
  AND lr."tenantId" IS NULL;

ALTER TABLE "LeaveRequest" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "LeaveRequest"
  ADD CONSTRAINT "LeaveRequest_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "LeaveRequest_tenantId_idx" ON "LeaveRequest"("tenantId");

ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

UPDATE "Attendance" a
SET "tenantId" = e."tenantId"
FROM "Employee" e
WHERE a."employeeId" = e.id
  AND a."tenantId" IS NULL;

ALTER TABLE "Attendance" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Attendance"
  ADD CONSTRAINT "Attendance_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Attendance_tenantId_date_idx" ON "Attendance"("tenantId", "date");

ALTER TABLE "Payslip" ADD COLUMN IF NOT EXISTS "tenantId" INTEGER;

UPDATE "Payslip" p
SET "tenantId" = e."tenantId"
FROM "Employee" e
WHERE p."employeeId" = e.id
  AND p."tenantId" IS NULL;

ALTER TABLE "Payslip" ALTER COLUMN "tenantId" SET NOT NULL;

ALTER TABLE "Payslip"
  ADD CONSTRAINT "Payslip_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Payslip_tenantId_idx" ON "Payslip"("tenantId");
