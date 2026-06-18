-- Extend leave policies for Sri Lanka presets and tenant customization
ALTER TABLE "LeavePolicy" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "LeavePolicy" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeavePolicy" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "LeavePolicy" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "LeavePolicy" ADD COLUMN IF NOT EXISTS "genderScope" TEXT NOT NULL DEFAULT 'ALL';

CREATE UNIQUE INDEX IF NOT EXISTS "LeavePolicy_tenantId_code_key" ON "LeavePolicy"("tenantId", "code");
