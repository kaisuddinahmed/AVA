-- Story 12: Add agent action fields to Intervention model
-- Run with: cd packages/db && npx prisma db execute --file ../../../story-12-agent/migration.sql

ALTER TABLE "Intervention" ADD COLUMN IF NOT EXISTS "actionCode"       TEXT;
ALTER TABLE "Intervention" ADD COLUMN IF NOT EXISTS "intentRaw"        TEXT;
ALTER TABLE "Intervention" ADD COLUMN IF NOT EXISTS "intentAction"     TEXT;
ALTER TABLE "Intervention" ADD COLUMN IF NOT EXISTS "intentCategory"   TEXT;
ALTER TABLE "Intervention" ADD COLUMN IF NOT EXISTS "intentAttributes" TEXT;
ALTER TABLE "Intervention" ADD COLUMN IF NOT EXISTS "productsShown"    TEXT;
ALTER TABLE "Intervention" ADD COLUMN IF NOT EXISTS "turnIndex"        INTEGER;
ALTER TABLE "Intervention" ADD COLUMN IF NOT EXISTS "latencyMs"        INTEGER;
