-- CreateTable
CREATE TABLE `tenders` (
    `id` VARCHAR(36) NOT NULL,
    `sourceKey` VARCHAR(191) NOT NULL,
    `procedureId` VARCHAR(191) NULL,
    `title` TEXT NOT NULL,
    `buyer` VARCHAR(500) NOT NULL,
    `buyerCity` VARCHAR(191) NULL,
    `buyerRegion` VARCHAR(80) NULL,
    `cpv` VARCHAR(20) NULL,
    `category` VARCHAR(20) NOT NULL,
    `publishedAt` DATETIME(3) NOT NULL,
    `deadline` DATETIME(3) NULL,
    `sourceUrl` TEXT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'unknown',
    `statusBasis` VARCHAR(500) NOT NULL,
    `contentHash` CHAR(64) NOT NULL,
    `analysisStatus` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `estimatedValue` DECIMAL(18, 2) NULL,
    `currency` CHAR(3) NULL,
    `valueBasis` VARCHAR(20) NULL,
    `isDemo` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tenders_sourceKey_key`(`sourceKey`),
    INDEX `tenders_publishedAt_idx`(`publishedAt`),
    INDEX `tenders_deadline_idx`(`deadline`),
    INDEX `tenders_category_publishedAt_idx`(`category`, `publishedAt`),
    INDEX `tenders_buyerRegion_idx`(`buyerRegion`),
    INDEX `tenders_cpv_idx`(`cpv`),
    INDEX `tenders_analysisStatus_idx`(`analysisStatus`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tender_notices` (
    `id` VARCHAR(36) NOT NULL,
    `tenderId` VARCHAR(36) NOT NULL,
    `sourceId` VARCHAR(191) NOT NULL,
    `noticeNumber` VARCHAR(100) NULL,
    `noticeType` VARCHAR(80) NOT NULL,
    `procedureId` VARCHAR(191) NULL,
    `raw` JSON NOT NULL,
    `text` LONGTEXT NOT NULL,
    `contentHash` CHAR(64) NOT NULL,
    `publishedAt` DATETIME(3) NOT NULL,
    `fetchedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `current` BOOLEAN NOT NULL DEFAULT true,

    INDEX `tender_notices_tenderId_publishedAt_idx`(`tenderId`, `publishedAt`),
    UNIQUE INDEX `tender_notices_sourceId_contentHash_key`(`sourceId`, `contentHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tender_analyses` (
    `id` VARCHAR(36) NOT NULL,
    `tenderId` VARCHAR(36) NOT NULL,
    `cacheKey` CHAR(64) NOT NULL,
    `status` VARCHAR(20) NOT NULL,
    `provider` VARCHAR(30) NOT NULL,
    `model` VARCHAR(100) NOT NULL,
    `promptVersion` VARCHAR(30) NOT NULL,
    `schemaVersion` VARCHAR(30) NOT NULL,
    `inputHash` CHAR(64) NOT NULL,
    `result` JSON NULL,
    `scope` JSON NOT NULL,
    `durationMs` INTEGER NULL,
    `tokens` INTEGER NULL,
    `error` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tender_analyses_cacheKey_key`(`cacheKey`),
    INDEX `tender_analyses_tenderId_createdAt_idx`(`tenderId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `analysis_jobs` (
    `id` VARCHAR(36) NOT NULL,
    `noticeId` VARCHAR(36) NOT NULL,
    `dedupeKey` CHAR(64) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'pending',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leaseUntil` DATETIME(3) NULL,
    `leaseOwner` VARCHAR(36) NULL,
    `error` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `analysis_jobs_dedupeKey_key`(`dedupeKey`),
    INDEX `analysis_jobs_status_availableAt_idx`(`status`, `availableAt`),
    INDEX `analysis_jobs_leaseUntil_idx`(`leaseUntil`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sync_state` (
    `id` VARCHAR(30) NOT NULL,
    `requested` BOOLEAN NOT NULL DEFAULT false,
    `checkpoint` DATETIME(3) NULL,
    `windowFrom` DATETIME(3) NULL,
    `windowTo` DATETIME(3) NULL,
    `cursors` JSON NULL,
    `leaseUntil` DATETIME(3) NULL,
    `leaseOwner` VARCHAR(36) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sync_logs` (
    `id` VARCHAR(36) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `status` VARCHAR(20) NOT NULL,
    `windowFrom` DATETIME(3) NOT NULL,
    `windowTo` DATETIME(3) NOT NULL,
    `pages` INTEGER NOT NULL DEFAULT 0,
    `fetched` INTEGER NOT NULL DEFAULT 0,
    `created` INTEGER NOT NULL DEFAULT 0,
    `changed` INTEGER NOT NULL DEFAULT 0,
    `skipped` INTEGER NOT NULL DEFAULT 0,
    `errors` INTEGER NOT NULL DEFAULT 0,
    `errorSummary` VARCHAR(500) NULL,
    `correlationId` VARCHAR(36) NOT NULL,

    UNIQUE INDEX `sync_logs_correlationId_key`(`correlationId`),
    INDEX `sync_logs_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_budgets` (
    `day` VARCHAR(10) NOT NULL,
    `calls` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`day`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `company_profiles` (
    `id` VARCHAR(36) NOT NULL,
    `ownerId` VARCHAR(36) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `description` TEXT NOT NULL,
    `services` JSON NOT NULL,
    `exclusions` JSON NOT NULL,
    `regions` JSON NOT NULL,
    `cpvCodes` JSON NOT NULL,
    `competencies` JSON NOT NULL,
    `minValue` DECIMAL(18, 2) NULL,
    `maxValue` DECIMAL(18, 2) NULL,
    `currency` CHAR(3) NULL,
    `valueBasis` VARCHAR(20) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `company_profiles_ownerId_version_key`(`ownerId`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tender_matches` (
    `id` VARCHAR(36) NOT NULL,
    `profileId` VARCHAR(36) NOT NULL,
    `tenderId` VARCHAR(36) NOT NULL,
    `contentHash` CHAR(64) NOT NULL,
    `scoringVersion` VARCHAR(30) NOT NULL,
    `score` INTEGER NOT NULL,
    `components` JSON NOT NULL,
    `explanation` TEXT NOT NULL,
    `missingInformation` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `tender_matches_profileId_score_idx`(`profileId`, `score`),
    UNIQUE INDEX `tender_matches_profileId_tenderId_contentHash_scoringVersion_key`(`profileId`, `tenderId`, `contentHash`, `scoringVersion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tender_notices` ADD CONSTRAINT `tender_notices_tenderId_fkey` FOREIGN KEY (`tenderId`) REFERENCES `tenders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tender_analyses` ADD CONSTRAINT `tender_analyses_tenderId_fkey` FOREIGN KEY (`tenderId`) REFERENCES `tenders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `analysis_jobs` ADD CONSTRAINT `analysis_jobs_noticeId_fkey` FOREIGN KEY (`noticeId`) REFERENCES `tender_notices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tender_matches` ADD CONSTRAINT `tender_matches_profileId_fkey` FOREIGN KEY (`profileId`) REFERENCES `company_profiles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tender_matches` ADD CONSTRAINT `tender_matches_tenderId_fkey` FOREIGN KEY (`tenderId`) REFERENCES `tenders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
