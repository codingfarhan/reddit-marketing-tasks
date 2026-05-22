import { taskTypeRequiresRedditUrl } from "@/lib/admin-types"
import { readAdminConfig } from "@/lib/admin-storage"
import { getTasksForPersona } from "@/lib/persona-groups"
import { commentPersonas } from "@/lib/personas"
import { saveSubmission } from "@/lib/submissions-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SavedTask = {
  taskId: string
  redditUrl: string
  postText: string
  taskType: string
  generatedComment: string | null
  commentUrl: string
}

type Body = {
  submissionId?: string
  name?: string
  personaId?: string
  redditUsername?: string
  tasks?: Array<{
    taskId?: string
    generatedComment?: string | null
    commentUrl?: string
  }>
}

type SubmissionMeta = {
  submissionId: string
  submittedAt: string
  name: string
  personaId: string
  redditUsername: string
  tasks: SavedTask[]
}

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

function getIstDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

function getWarmupDay(startDate: string) {
  if (!startDate) return null
  const today = new Date(`${getIstDateKey()}T00:00:00.000+05:30`).getTime()
  const start = new Date(`${startDate}T00:00:00.000+05:30`).getTime()
  const day = Math.floor((today - start) / 86_400_000) + 1
  return day >= 1 && day <= 7 ? day : null
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body
    const submissionId = String(body.submissionId ?? "").trim()
    const name = String(body.name ?? "").trim()
    const personaId = String(body.personaId ?? "").trim()
    const redditUsername = String(body.redditUsername ?? "").trim()

    if (!submissionId) return Response.json({ error: "Missing submissionId" }, { status: 400 })
    if (!name) return Response.json({ error: "Missing name" }, { status: 400 })
    if (!personaId) return Response.json({ error: "Missing personaId" }, { status: 400 })
    if (!redditUsername) return Response.json({ error: "Missing redditUsername" }, { status: 400 })

    const persona = commentPersonas.find((item) => item.id === personaId && item.name === name)
    if (!persona) return Response.json({ error: "Select a valid name from the dropdown" }, { status: 400 })

    const config = await readAdminConfig()
    const personaSetting = config.personaSettings.find((setting) => setting.personaId === personaId)
    const warmupDay = personaSetting?.status === "warmup" ? getWarmupDay(personaSetting.warmupStartDate) : null
    const configuredTasks = warmupDay ? config.warmupTasks[warmupDay - 1] ?? [] : getTasksForPersona(config.tasks, personaId)
    const hasValidSetup =
      configuredTasks.length > 0 &&
      configuredTasks.every(
        (task) =>
          task.id &&
          (!taskTypeRequiresRedditUrl(task.taskType) || task.redditUrl.trim()) &&
          (task.taskType !== "comment"
            ? true
            : task.commentMode === "custom"
            ? task.customComment.trim()
            : task.commentMode === "freeform"
              ? true
              : task.postText.trim()) &&
          (!taskTypeRequiresRedditUrl(task.taskType) || isValidHttpUrl(task.redditUrl)),
      ) &&
      configuredTasks.every(
        (task) =>
          task.taskType !== "comment" ||
          task.commentMode === "freeform" ||
          Boolean(
            config.generatedTaskComments
              .find((item) => item.taskId === task.id)
              ?.comments.find((comment) => comment.personaId === personaId)?.comment,
          ),
      )

    if (!hasValidSetup) {
      return Response.json({ error: "Admin setup is incomplete. Add tasks and generate comments first." }, { status: 400 })
    }

    const now = new Date()
    const taskInputs = Array.isArray(body.tasks) ? body.tasks : []
    const inputByTaskId = new Map(taskInputs.map((task) => [String(task.taskId ?? ""), task] as const))

    const savedTasks: SavedTask[] = configuredTasks.map((task) => {
      const input = inputByTaskId.get(task.id)
      const commentUrl = String(input?.commentUrl ?? "").trim()
      const generatedComment = typeof input?.generatedComment === "string" && input.generatedComment.trim() ? input.generatedComment.trim() : null

      return {
        taskId: task.id,
        redditUrl: task.redditUrl,
        postText: task.postText,
        taskType: task.taskType,
        generatedComment,
        commentUrl,
      }
    })

    const missing = savedTasks.find((task) => !task.commentUrl)
    if (missing) {
      return Response.json(
        { error: missing.taskType === "comment" ? `Missing Reddit comment URL for ${missing.taskId}` : `Missing screenshot for ${missing.taskId}` },
        { status: 400 },
      )
    }

    const invalid = savedTasks.find((task) => task.taskType === "comment" && !isValidHttpUrl(task.commentUrl))
    if (invalid) {
      return Response.json({ error: `Invalid Reddit comment URL for ${invalid.taskId}` }, { status: 400 })
    }

    const meta: SubmissionMeta = {
      submissionId,
      submittedAt: now.toISOString(),
      name,
      personaId,
      redditUsername,
      tasks: savedTasks,
    }

    await saveSubmission(meta)

    return Response.json({ ok: true, submissionId })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}
