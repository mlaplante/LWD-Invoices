-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'PROJECT_BUDGET_ALERT';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "budgetAlert80SentAt" TIMESTAMP(3),
ADD COLUMN     "budgetAlert100SentAt" TIMESTAMP(3);
