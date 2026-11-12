ALTER TABLE `sync_logs` ADD COLUMN `filtered` INTEGER NOT NULL DEFAULT 0;
CREATE TABLE `sync_rejected_records` (
 `mode` VARCHAR(10) NOT NULL,
 `recordKey` CHAR(64) NOT NULL,
 `sourceId` VARCHAR(30) NOT NULL,
 `noticeType` VARCHAR(80) NOT NULL,
 `externalId` VARCHAR(191) NULL,
 `raw` JSON NOT NULL,
 `code` VARCHAR(80) NOT NULL,
 `attempts` INTEGER NOT NULL DEFAULT 1,
 `firstSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 `lastSeenAt` DATETIME(3) NOT NULL,
 `resolvedAt` DATETIME(3) NULL,
 PRIMARY KEY (`recordKey`),
 INDEX `sync_rejected_records_sourceId_resolvedAt_idx` (`sourceId`,`resolvedAt`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
