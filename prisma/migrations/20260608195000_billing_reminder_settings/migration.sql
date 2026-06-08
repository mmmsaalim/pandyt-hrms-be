CREATE TABLE "tenant_billing_settings" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" INTEGER NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "reminderDaysCsv" TEXT NOT NULL DEFAULT '7,3,1,0',
  "recipientEmailsCsv" TEXT,
  "subjectTemplate" TEXT,
  "bodyTemplate" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_billing_settings_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "tenant_billing_settings_tenantId_key"
  ON "tenant_billing_settings"("tenantId");

CREATE TABLE "billing_reminder_dispatch" (
  "id" SERIAL PRIMARY KEY,
  "tenantId" INTEGER NOT NULL,
  "reminderType" TEXT NOT NULL,
  "reminderKey" TEXT NOT NULL,
  "recipientCount" INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_reminder_dispatch_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "billing_reminder_dispatch_tenantId_reminderKey_key"
  ON "billing_reminder_dispatch"("tenantId", "reminderKey");

CREATE INDEX "billing_reminder_dispatch_sentAt_idx"
  ON "billing_reminder_dispatch"("sentAt");
