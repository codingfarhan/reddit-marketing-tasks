ALTER TABLE "AdminTask"
ADD COLUMN "taskType" TEXT NOT NULL DEFAULT 'comment',
ADD COLUMN "taskCategory" TEXT NOT NULL DEFAULT 'marketing',
ADD COLUMN "warmupDay" INTEGER;

CREATE TABLE "PersonaSetting" (
    "personaId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'marketing',
    "warmupStartDate" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonaSetting_pkey" PRIMARY KEY ("personaId")
);
