-- AlterTable
ALTER TABLE "Client" ADD COLUMN "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- GIN index so tag filters (`tags @> ARRAY[?]`) stay fast as client counts grow
CREATE INDEX "Client_tags_idx" ON "Client" USING GIN ("tags");
