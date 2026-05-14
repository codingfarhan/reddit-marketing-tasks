CREATE TABLE "AdminTask" (
    "id" TEXT NOT NULL,
    "redditUrl" TEXT NOT NULL,
    "postText" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneratedComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "personaName" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT NOT NULL,
    "personaId" TEXT NOT NULL,
    "redditUsername" TEXT NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubmissionTask" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "redditUrl" TEXT NOT NULL,
    "postText" TEXT NOT NULL,
    "generatedComment" TEXT,
    "commentUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "SubmissionTask_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminTask_sortOrder_key" ON "AdminTask"("sortOrder");
CREATE UNIQUE INDEX "GeneratedComment_taskId_personaId_key" ON "GeneratedComment"("taskId", "personaId");
CREATE INDEX "GeneratedComment_personaId_idx" ON "GeneratedComment"("personaId");
CREATE INDEX "Submission_personaId_idx" ON "Submission"("personaId");
CREATE INDEX "Submission_submittedAt_idx" ON "Submission"("submittedAt");
CREATE INDEX "SubmissionTask_taskId_idx" ON "SubmissionTask"("taskId");
CREATE UNIQUE INDEX "SubmissionTask_submissionId_taskId_key" ON "SubmissionTask"("submissionId", "taskId");

ALTER TABLE "GeneratedComment" ADD CONSTRAINT "GeneratedComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AdminTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionTask" ADD CONSTRAINT "SubmissionTask_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionTask" ADD CONSTRAINT "SubmissionTask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AdminTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
