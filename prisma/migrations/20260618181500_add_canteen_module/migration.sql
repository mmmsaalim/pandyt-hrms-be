CREATE TABLE "canteen_settings" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "defaultMealCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salaryDeduct" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canteen_settings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "canteen_meal_entries" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "mealCount" INTEGER NOT NULL DEFAULT 1,
    "mealCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductFromSalary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "canteen_meal_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "canteen_settings_tenantId_key" ON "canteen_settings"("tenantId");
CREATE UNIQUE INDEX "canteen_meal_entries_employeeId_date_key" ON "canteen_meal_entries"("employeeId", "date");
CREATE INDEX "canteen_meal_entries_tenantId_date_idx" ON "canteen_meal_entries"("tenantId", "date");

ALTER TABLE "canteen_settings" ADD CONSTRAINT "canteen_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "canteen_meal_entries" ADD CONSTRAINT "canteen_meal_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "canteen_meal_entries" ADD CONSTRAINT "canteen_meal_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "module_definitions" ("key", "label", "description", "sortOrder", "isActive")
VALUES ('canteen', 'Canteen', 'Track daily meals and optional salary deductions.', 9, true)
ON CONFLICT ("key") DO UPDATE SET
  "label" = EXCLUDED."label",
  "description" = EXCLUDED."description",
  "sortOrder" = EXCLUDED."sortOrder",
  "isActive" = true;

INSERT INTO "permissions" ("permission", "module", "description")
VALUES
  ('canteen.read', 'canteen', 'View canteen meal entries.'),
  ('canteen.manage', 'canteen', 'Manage canteen meal entries and settings.')
ON CONFLICT ("permission") DO UPDATE SET
  "module" = EXCLUDED."module",
  "description" = EXCLUDED."description";

INSERT INTO "roles_permission" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r."role" IN ('SUPER_ADMIN', 'COMPANY_ADMIN', 'HR_MANAGER', 'TEAM_LEAD')
  AND p."permission" IN ('canteen.read', 'canteen.manage')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "tenant_module_settings" ("tenantId", "moduleKey", "enabled")
SELECT t."id", 'canteen', CASE WHEN UPPER(t."plan") IN ('GROWTH', 'ENTERPRISE') THEN true ELSE false END
FROM "Tenant" t
ON CONFLICT ("tenantId", "moduleKey") DO NOTHING;

