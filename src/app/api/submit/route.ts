import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { redditTasks } from "@/lib/tasks"

export const runtime = "nodejs"

type SavedTask = {
  taskId: string
  redditUrl: string
  exampleComment: string
  generatedComment: string | null
  commentUrl: string
}

type Body = {
  submissionId?: string
  name?: string
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
  redditUsername: string
  tasks: SavedTask[]
}

const submissionsFile = path.join(process.cwd(), "storage", "submissions.json")

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
    const redditUsername = String(body.redditUsername ?? "").trim()

    if (!submissionId) return Response.json({ error: "Missing submissionId" }, { status: 400 })
    if (!name) return Response.json({ error: "Missing name" }, { status: 400 })
    if (!redditUsername) return Response.json({ error: "Missing redditUsername" }, { status: 400 })

    const now = new Date()
    const taskInputs = Array.isArray(body.tasks) ? body.tasks : []
    const inputByTaskId = new Map(taskInputs.map((task) => [String(task.taskId ?? ""), task] as const))

    const savedTasks: SavedTask[] = redditTasks.map((task) => {
      const input = inputByTaskId.get(task.id)
      const commentUrl = String(input?.commentUrl ?? "").trim()
      const generatedComment = typeof input?.generatedComment === "string" && input.generatedComment.trim() ? input.generatedComment.trim() : null

      return {
        taskId: task.id,
        redditUrl: task.redditUrl,
        exampleComment: task.exampleComment,
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
      redditUsername,
      tasks: savedTasks,
    }

    await mkdir(path.dirname(submissionsFile), { recursive: true })

    let existing: SubmissionMeta[] = []
    try {
      const raw = await readFile(submissionsFile, "utf8")
      const parsed = JSON.parse(raw) as unknown
      existing = Array.isArray(parsed) ? (parsed as SubmissionMeta[]) : []
    } catch {
      existing = []
    }

    const withoutCurrent = existing.filter((submission) => submission.submissionId !== submissionId)
    await writeFile(submissionsFile, JSON.stringify([meta, ...withoutCurrent], null, 2), "utf8")

    return Response.json({ ok: true, submissionId })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return Response.json({ error: message }, { status: 500 })
  }
}
