-- AlterTable
ALTER TABLE "RedditAccount" ADD COLUMN     "karma" INTEGER;

-- CreateTable
CREATE TABLE "AccountWeekMetric" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weeklyComments" INTEGER NOT NULL,
    "weeklyPosts" INTEGER NOT NULL,
    "refreshedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountWeekMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountWeekMetric_accountId_idx" ON "AccountWeekMetric"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountWeekMetric_accountId_weekStart_key" ON "AccountWeekMetric"("accountId", "weekStart");

-- AddForeignKey
ALTER TABLE "AccountWeekMetric" ADD CONSTRAINT "AccountWeekMetric_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "RedditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
