-- CreateEnum
CREATE TYPE "JobPostStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED');

-- CreateTable
CREATE TABLE "JobPost" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "description" TEXT,
    "requiredSkills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "JobPostStatus" NOT NULL DEFAULT 'DRAFT',
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPost_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Candidate" ADD COLUMN "jobPostId" INTEGER,
ADD COLUMN "phone" TEXT,
ADD COLUMN "resumeUrl" TEXT,
ADD COLUMN "resumeFileName" TEXT,
ADD COLUMN "notes" TEXT;

-- Convert stage from TEXT to PipelineStage
ALTER TABLE "Candidate" ALTER COLUMN "stage" DROP DEFAULT;
ALTER TABLE "Candidate" ALTER COLUMN "stage" TYPE "PipelineStage" USING (
  CASE UPPER("stage")
    WHEN 'APPLIED' THEN 'APPLIED'::"PipelineStage"
    WHEN 'APPLICATION' THEN 'APPLIED'::"PipelineStage"
    WHEN 'SCREENING' THEN 'SCREENING'::"PipelineStage"
    WHEN 'SCREENED' THEN 'SCREENING'::"PipelineStage"
    WHEN 'INTERVIEW' THEN 'INTERVIEW'::"PipelineStage"
    WHEN 'OFFER' THEN 'OFFER'::"PipelineStage"
    WHEN 'OFFERED' THEN 'OFFER'::"PipelineStage"
    WHEN 'HIRED' THEN 'HIRED'::"PipelineStage"
    WHEN 'REJECTED' THEN 'REJECTED'::"PipelineStage"
    ELSE 'APPLIED'::"PipelineStage"
  END
);
ALTER TABLE "Candidate" ALTER COLUMN "stage" SET DEFAULT 'APPLIED';

-- AddForeignKey
ALTER TABLE "JobPost" ADD CONSTRAINT "JobPost_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_jobPostId_fkey" FOREIGN KEY ("jobPostId") REFERENCES "JobPost"("id") ON DELETE SET NULL ON UPDATE CASCADE;
