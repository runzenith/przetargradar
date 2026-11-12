ALTER TABLE `sync_logs` ADD COLUMN `sourceId` VARCHAR(30) NOT NULL DEFAULT 'bzp';
CREATE INDEX `sync_logs_sourceId_startedAt_idx` ON `sync_logs`(`sourceId`, `startedAt`);
