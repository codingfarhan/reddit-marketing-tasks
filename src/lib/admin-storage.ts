import { emptyAdminConfig, type AdminConfig } from "@/lib/admin-types"
import { prisma } from "@/lib/db"
import { commentPersonas } from "@/lib/personas"

function formatIstDateInput(date: Date | null | undefined) {
  if (!date) return ""
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

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
  const personaSettings = await prisma.personaSetting.findMany()

  if (tasks.length === 0) {
    return {
      ...fallback,
      personaSettings: commentPersonas.map((persona) => {
        const setting = personaSettings.find((item) => item.personaId === persona.id)
        return {
          personaId: persona.id,
          status: setting?.status === "warmup" ? "warmup" : "marketing",
          warmupStartDate: formatIstDateInput(setting?.warmupStartDate),
        }
      }),
    }
  }

  const generatedTaskComments = tasks
    .filter((task) => task.generatedComments.length > 0)
    .map((task) => ({
      taskId: task.id,
      redditUrl: task.redditUrl,
      comments: task.generatedComments.map((comment) => ({
        personaId: comment.personaId,
        name: comment.personaName,
        comment: comment.comment,
      })),
    }))

  return {
    tasks: tasks.filter((task) => task.taskCategory !== "warmup").map((task) => ({
      id: task.id,
      redditUrl: task.redditUrl,
      postText: task.postText,
      taskType: task.taskType === "upvote" || task.taskType === "join_subreddit" ? task.taskType : "comment",
      commentMode: task.commentMode === "custom" || task.commentMode === "freeform" ? task.commentMode : "ai",
      customComment: task.customComment,
      taskCategory: "marketing",
      warmupDay: null,
    })),
    warmupTasks: Array.from({ length: 7 }, (_, index) =>
      tasks
        .filter((task) => task.taskCategory === "warmup" && task.warmupDay === index + 1)
        .map((task) => ({
          id: task.id,
          redditUrl: task.redditUrl,
          postText: task.postText,
          taskType: task.taskType === "upvote" || task.taskType === "join_subreddit" ? task.taskType : "comment",
          commentMode: task.commentMode === "custom" || task.commentMode === "freeform" ? task.commentMode : "ai",
          customComment: task.customComment,
          taskCategory: "warmup",
          warmupDay: index + 1,
        })),
    ),
    personaSettings: commentPersonas.map((persona) => {
      const setting = personaSettings.find((item) => item.personaId === persona.id)
      return {
        personaId: persona.id,
        status: setting?.status === "warmup" ? "warmup" : "marketing",
        warmupStartDate: formatIstDateInput(setting?.warmupStartDate),
      }
    }),
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
  const allTasks = [
    ...config.tasks,
    ...config.warmupTasks.flatMap((tasks, dayIndex) =>
      tasks.map((task) => ({
        ...task,
        taskCategory: "warmup" as const,
        warmupDay: dayIndex + 1,
      })),
    ),
  ]
  const commentRows = config.generatedTaskComments.flatMap((task) =>
    task.comments.map((comment) => ({
      taskId: task.taskId,
      personaId: comment.personaId,
      personaName: comment.name,
      comment: comment.comment,
    })),
  )

  const existingTasks = await prisma.adminTask.findMany({
    select: { id: true, sortOrder: true },
    orderBy: { sortOrder: "asc" },
  })
  const lowestSortOrder = existingTasks.reduce((lowest, task) => Math.min(lowest, task.sortOrder), 0)
  const temporarySortOrderStart = lowestSortOrder - existingTasks.length - 1000

  for (const [index, task] of existingTasks.entries()) {
    await prisma.adminTask.update({
      where: { id: task.id },
      data: {
        isActive: false,
        sortOrder: temporarySortOrderStart + index,
      },
    })
  }

  for (const [index, task] of allTasks.entries()) {
    await prisma.adminTask.upsert({
      where: { id: task.id },
      create: {
        id: task.id,
        redditUrl: task.redditUrl,
        postText: task.postText,
        taskType: task.taskType,
        commentMode: task.commentMode,
        customComment: task.customComment,
        taskCategory: task.taskCategory,
        warmupDay: task.warmupDay,
        sortOrder: index + 1,
        isActive: true,
      },
      update: {
        redditUrl: task.redditUrl,
        postText: task.postText,
        taskType: task.taskType,
        commentMode: task.commentMode,
        customComment: task.customComment,
        taskCategory: task.taskCategory,
        warmupDay: task.warmupDay,
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

  for (const setting of config.personaSettings) {
    await prisma.personaSetting.upsert({
      where: { personaId: setting.personaId },
      create: {
        personaId: setting.personaId,
        status: setting.status,
        warmupStartDate: setting.warmupStartDate ? new Date(`${setting.warmupStartDate}T00:00:00.000+05:30`) : null,
      },
      update: {
        status: setting.status,
        warmupStartDate: setting.warmupStartDate ? new Date(`${setting.warmupStartDate}T00:00:00.000+05:30`) : null,
      },
    })
  }
}
