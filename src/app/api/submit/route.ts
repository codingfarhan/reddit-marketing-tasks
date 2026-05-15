import { readAdminConfig } from "@/lib/admin-storage"
import { commentPersonas } from "@/lib/personas"
import { saveSubmission } from "@/lib/submissions-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type SavedTask = {
  taskId: string
  redditUrl: string
  postText: string
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
    const configuredTasks = config.tasks
    const hasValidSetup =
      configuredTasks.length > 0 &&
      configuredTasks.every(
        (task) =>
          task.id &&
          task.redditUrl.trim() &&
          (task.commentMode === "custom"
            ? task.customComment.trim()
            : task.commentMode === "freeform"
              ? true
              : task.postText.trim()) &&
          isValidHttpUrl(task.redditUrl),
      ) &&
      configuredTasks.every(
        (task) =>
          task.commentMode === "freeform" ||
          Boolean(config.generatedTaskComments.find((item) => item.taskId === task.id)),
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
        generatedComment,
        commentUrl,
      }
    })

    const missing = savedTasks.find((task) => !task.commentUrl)
    if (missing) {
      return Response.json({ error: `Missing Reddit comment URL for ${missing.taskId}` }, { status: 400 })
    }

    const invalid = savedTasks.find((task) => !isValidHttpUrl(task.commentUrl))
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
