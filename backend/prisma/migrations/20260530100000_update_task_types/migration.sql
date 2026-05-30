-- AlterEnum
-- Add new task type values to support general-purpose task management
ALTER TYPE "TaskType" ADD VALUE 'HABIT';
ALTER TYPE "TaskType" ADD VALUE 'STUDY';
ALTER TYPE "TaskType" ADD VALUE 'WORK';
ALTER TYPE "TaskType" ADD VALUE 'LIFE';
ALTER TYPE "TaskType" ADD VALUE 'GOAL';
ALTER TYPE "TaskType" ADD VALUE 'EVENT';
ALTER TYPE "TaskType" ADD VALUE 'NOTE';
ALTER TYPE "TaskType" ADD VALUE 'PROJECT';

-- DataMigration: Convert existing tasks from old types to new types
-- BUG → TASK (generic task)
UPDATE "Task" SET "type" = 'TASK' WHERE "type" = 'BUG';

-- EPIC → PROJECT (large-scope initiative)
UPDATE "Task" SET "type" = 'PROJECT' WHERE "type" = 'EPIC';

-- STORY → TASK (story becomes generic task)
UPDATE "Task" SET "type" = 'TASK' WHERE "type" = 'STORY';

-- Update project inbox default task types
UPDATE "ProjectInbox" SET "default_task_type" = 'TASK' WHERE "default_task_type" IN ('BUG', 'EPIC', 'STORY');
