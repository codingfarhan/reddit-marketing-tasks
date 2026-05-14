import { emptyAdminConfig, type AdminConfig } from "@/lib/admin-types"
import { prisma } from "@/lib/db"
import { commentPersonas } from "@/lib/personas"

export async function readAdminConfig(): Promise<AdminConfig> {
  const fallback = emptyAdminConfig()
  const tasks = await prisma.adminTask.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      generatedComments: {
        orderBy: { personaId: "asc" },
      },
    },
  })

  if (tasks.length === 0) return fallback

  const generatedTaskComments = tasks
    .filter((task) => task.generatedComments.length > 0)
    .map((task) => ({
      taskId: task.id,
      redditUrl: task.redditUrl,
      comments: commentPersonas.map((persona) => {
        const generated = task.generatedComments.find((comment) => comment.personaId === persona.id)
        return {
          personaId: persona.id,
          name: persona.name,
          comment: generated?.comment ?? "",
        }
      }),
    }))

  return {
    tasks: tasks.map((task) => ({
      id: task.id,
      redditUrl: task.redditUrl,
      postText: task.postText,
    })),
    generatedTaskComments,
    updatedAt: tasks.reduce<string | null>((latest, task) => {
      const iso = task.updatedAt.toISOString()
      return !latest || latest < iso ? iso : latest
    }, null),
    generatedAt:
      tasks
        .flatMap((task) => task.generatedComments)
        .reduce<string | null>((latest, comment) => {
          const iso = comment.updatedAt.toISOString()
          return !latest || latest < iso ? iso : latest
        }, null) ?? null,
  }
}

export async function writeAdminConfig(config: AdminConfig) {
  const commentRows = config.generatedTaskComments.flatMap((task) =>
    task.comments.map((comment) => ({
      taskId: task.taskId,
      personaId: comment.personaId,
      personaName: comment.name,
      comment: comment.comment,
    })),
  )

  await prisma.adminTask.updateMany({
    data: { isActive: false },
  })

  for (const [index, task] of config.tasks.entries()) {
    await prisma.adminTask.upsert({
      where: { id: task.id },
      create: {
        id: task.id,
        redditUrl: task.redditUrl,
        postText: task.postText,
        sortOrder: index + 1,
        isActive: true,
      },
      update: {
        redditUrl: task.redditUrl,
        postText: task.postText,
        sortOrder: index + 1,
        isActive: true,
      },
    })
  }

  await prisma.generatedComment.deleteMany({})

  if (commentRows.length > 0) {
    await prisma.generatedComment.createMany({
      data: commentRows,
    })
  }
}
