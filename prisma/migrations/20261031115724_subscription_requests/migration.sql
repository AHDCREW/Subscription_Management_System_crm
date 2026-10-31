-- AlterTable
ALTER TABLE `Subscription` ADD COLUMN `requestedAt` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `Subscription_status_requestedAt_idx` ON `Subscription`(`status`, `requestedAt`);
