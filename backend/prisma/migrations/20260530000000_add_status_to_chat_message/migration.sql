-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE "chat_messages" ALTER COLUMN "content" SET DEFAULT '';
