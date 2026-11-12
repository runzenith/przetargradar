-- AlterTable
ALTER TABLE `ai_budgets` ADD COLUMN `nextCallAt` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `AiProviderState` (
    `id` VARCHAR(100) NOT NULL,
    `pausedUntil` DATETIME(3) NOT NULL,
    `error` VARCHAR(500) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(36) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `tokenHash` CHAR(64) NOT NULL,
    `userId` VARCHAR(36) NOT NULL,
    `csrf` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,

    INDEX `Session_userId_idx`(`userId`),
    INDEX `Session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`tokenHash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserTender` (
    `userId` VARCHAR(36) NOT NULL,
    `tenderId` VARCHAR(36) NOT NULL,
    `saved` BOOLEAN NOT NULL DEFAULT false,
    `readAt` DATETIME(3) NULL,

    INDEX `UserTender_userId_saved_idx`(`userId`, `saved`),
    PRIMARY KEY (`userId`, `tenderId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserTender` ADD CONSTRAINT `UserTender_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserTender` ADD CONSTRAINT `UserTender_tenderId_fkey` FOREIGN KEY (`tenderId`) REFERENCES `tenders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
