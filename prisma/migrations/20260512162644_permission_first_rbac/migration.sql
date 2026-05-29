/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,name]` on the table `Role` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedDate` to the `Role` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedDate` to the `UserRole` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "Role_name_key";

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "createdBy" INTEGER,
ADD COLUMN     "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "tenantId" INTEGER,
ADD COLUMN     "updatedBy" INTEGER,
ADD COLUMN     "updatedDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserRole" ADD COLUMN     "createdBy" INTEGER,
ADD COLUMN     "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedBy" INTEGER,
ADD COLUMN     "updatedDate" TIMESTAMP(3);

-- Backfill existing rows before enforcing NOT NULL on new audit columns.
UPDATE "Role"
SET "updatedDate" = COALESCE("updatedDate", CURRENT_TIMESTAMP)
WHERE "updatedDate" IS NULL;

UPDATE "UserRole"
SET "updatedDate" = COALESCE("updatedDate", CURRENT_TIMESTAMP)
WHERE "updatedDate" IS NULL;

-- Enforce the schema contract after existing data has been populated.
ALTER TABLE "Role"
ALTER COLUMN "updatedDate" SET NOT NULL;

ALTER TABLE "UserRole"
ALTER COLUMN "updatedDate" SET NOT NULL;

-- CreateTable
CREATE TABLE "Permission" (
    "id" SERIAL NOT NULL,
    "permission" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" SERIAL NOT NULL,
    "roleId" INTEGER NOT NULL,
    "permissionId" INTEGER NOT NULL,
    "createdDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" INTEGER,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Permission_permission_key" ON "Permission"("permission");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_name_key" ON "Role"("tenantId", "name");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
