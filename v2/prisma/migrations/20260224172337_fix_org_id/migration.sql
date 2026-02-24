/*
  Warnings:

  - You are about to drop the column `clerkId` on the `Organization` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Organization_clerkId_key";

-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "clerkId";
