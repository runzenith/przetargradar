CREATE TABLE `document_assets` (
 `id` CHAR(64) NOT NULL PRIMARY KEY, `url` TEXT NOT NULL, `byteSize` INTEGER NOT NULL DEFAULT 0, `bytes` LONGBLOB NULL,
 `contentHash` CHAR(64) NULL, `text` LONGTEXT NOT NULL, `status` VARCHAR(40) NOT NULL,
 `checkedAt` DATETIME(3) NOT NULL
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `document_scans` (
 `noticeId` VARCHAR(36) NOT NULL PRIMARY KEY, `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
 `report` JSON NOT NULL, `materials` JSON NOT NULL, `nextAt` DATETIME(3) NOT NULL,
 `leaseUntil` DATETIME(3) NULL, `leaseOwner` VARCHAR(36) NULL,
 INDEX `document_scans_nextAt_idx` (`nextAt`),
 CONSTRAINT `document_scans_noticeId_fkey` FOREIGN KEY (`noticeId`) REFERENCES `tender_notices` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
