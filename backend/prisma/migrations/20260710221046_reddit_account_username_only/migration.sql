/*
  Warnings:

  - You are about to drop the column `refreshTokenEncrypted` on the `RedditAccount` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "RedditAccount" DROP COLUMN "refreshTokenEncrypted";
