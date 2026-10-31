-- CreateTable
CREATE TABLE `BillingRun` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `trigger` ENUM('MANUAL', 'SCHEDULED') NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `activated` INTEGER NOT NULL DEFAULT 0,
    `invoicesCreated` INTEGER NOT NULL DEFAULT 0,
    `skippedDuplicates` INTEGER NOT NULL DEFAULT 0,
    `closed` INTEGER NOT NULL DEFAULT 0,
    `errorCount` INTEGER NOT NULL DEFAULT 0,
    `errors` JSON NULL,
    `triggeredById` INTEGER NULL,

    INDEX `BillingRun_startedAt_idx`(`startedAt`),
    INDEX `BillingRun_trigger_startedAt_idx`(`trigger`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Invoice_invoiceDate_idx` ON `Invoice`(`invoiceDate`);

-- CreateIndex
CREATE INDEX `Subscription_startDate_idx` ON `Subscription`(`startDate`);

-- AddForeignKey
ALTER TABLE `BillingRun` ADD CONSTRAINT `BillingRun_triggeredById_fkey` FOREIGN KEY (`triggeredById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
