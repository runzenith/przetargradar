-- CreateTable
CREATE TABLE `AiQuotaLock` (
    `id` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiCall` (
    `id` VARCHAR(36) NOT NULL,
    `model` VARCHAR(100) NOT NULL,
    `jobId` VARCHAR(36) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `pacificDay` VARCHAR(10) NOT NULL,
    `reservedTokens` INTEGER NOT NULL,
    `tokens` INTEGER NULL,
    `status` VARCHAR(30) NOT NULL DEFAULT 'processing',
    `code` VARCHAR(500) NULL,

    INDEX `AiCall_model_startedAt_idx`(`model`, `startedAt`),
    INDEX `AiCall_model_pacificDay_idx`(`model`, `pacificDay`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
