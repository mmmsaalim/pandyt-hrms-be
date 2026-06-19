-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "approvalComment" TEXT;
ALTER TABLE "LeaveRequest" ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;
