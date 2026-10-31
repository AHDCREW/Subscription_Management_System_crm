-- AlterTable
ALTER TABLE `User` ADD COLUMN `approvedAt` DATETIME(3) NULL,
    ADD COLUMN `approvedById` INTEGER NULL;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: every account that exists today was already allowed in, so it
-- counts as approved from the day it was created.
UPDATE `User` SET `approvedAt` = `createdAt` WHERE `approvedAt` IS NULL;
