-- CreateTable
CREATE TABLE "KarmaSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "karma" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KarmaSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KarmaSnapshot_accountId_idx" ON "KarmaSnapshot"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "KarmaSnapshot_accountId_weekStart_key" ON "KarmaSnapshot"("accountId", "weekStart");

-- AddForeignKey
ALTER TABLE "KarmaSnapshot" ADD CONSTRAINT "KarmaSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "RedditAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
