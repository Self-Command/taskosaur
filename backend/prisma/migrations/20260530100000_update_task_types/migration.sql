-- Drop old TaskType enum and recreate with only new values (no backward compat)
-- Step 1: Migrate existing data to new types first
UPDATE "Task" SET "type" = 'TASK' WHERE "type" IN ('BUG', 'STORY');
UPDATE "Task" SET "type" = 'PROJECT' WHERE "type" = 'EPIC';
UPDATE "ProjectInbox" SET "default_task_type" = 'TASK' WHERE "default_task_type" IN ('BUG', 'EPIC', 'STORY');

-- Step 2: Rename old enum
ALTER TYPE "TaskType" RENAME TO "TaskType_old";

-- Step 3: Create new enum with only new values
CREATE TYPE "TaskType" AS ENUM ('TASK', 'HABIT', 'STUDY', 'WORK', 'LIFE', 'GOAL', 'EVENT', 'NOTE', 'PROJECT', 'SUBTASK');

-- Step 4: Switch all columns to the new enum
ALTER TABLE "Task" ALTER COLUMN "type" TYPE "TaskType" USING "type"::text::"TaskType";
ALTER TABLE "ProjectInbox" ALTER COLUMN "default_task_type" TYPE "TaskType" USING "default_task_type"::text::"TaskType";

-- Step 5: Drop old enum
DROP TYPE "TaskType_old";
