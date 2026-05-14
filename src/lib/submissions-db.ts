import { prisma } from "@/lib/db"

export type SavedSubmissionTask = {
  taskId: string
  redditUrl: string
  postText: string
  generatedComment: string | null
  commentUrl: string
}

export type SavedSubmission = {
  submissionId: string
  submittedAt: string
  name: string
  personaId: string
  redditUsername: string
  tasks: SavedSubmissionTask[]
}

export async function saveSubmission(submission: SavedSubmission) {
  await prisma.submission.upsert({
    where: { id: submission.submissionId },
    create: {
      id: submission.submissionId,
      submittedAt: new Date(submission.submittedAt),
      name: submission.name,
      personaId: submission.personaId,
      redditUsername: submission.redditUsername,
      tasks: {
        create: submission.tasks.map((task, index) => ({
          taskId: task.taskId,
          redditUrl: task.redditUrl,
          postText: task.postText,
          generatedComment: task.generatedComment,
          commentUrl: task.commentUrl,
          sortOrder: index + 1,
        })),
      },
    },
    update: {
      submittedAt: new Date(submission.submittedAt),
      name: submission.name,
      personaId: submission.personaId,
      redditUsername: submission.redditUsername,
      tasks: {
        deleteMany: {},
        create: submission.tasks.map((task, index) => ({
          taskId: task.taskId,
          redditUrl: task.redditUrl,
          postText: task.postText,
          generatedComment: task.generatedComment,
          commentUrl: task.commentUrl,
          sortOrder: index + 1,
        })),
      },
    },
  })
}

export async function readSubmissions(): Promise<SavedSubmission[]> {
  const submissions = await prisma.submission.findMany({
    orderBy: { submittedAt: "desc" },
    include: {
      tasks: {
        orderBy: { sortOrder: "asc" },
      },
    },
  })

  return submissions.map((submission) => ({
    submissionId: submission.id,
    submittedAt: submission.submittedAt.toISOString(),
    name: submission.name,
    personaId: submission.personaId,
    redditUsername: submission.redditUsername,
    tasks: submission.tasks.map((task) => ({
      taskId: task.taskId,
      redditUrl: task.redditUrl,
      postText: task.postText,
      generatedComment: task.generatedComment,
      commentUrl: task.commentUrl,
    })),
  }))
}
