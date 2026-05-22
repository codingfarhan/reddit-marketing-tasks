import { isAdminTaskType, type AdminRedditTask } from "@/lib/admin-types"
import { readAdminConfig, writeAdminConfig } from "@/lib/admin-storage"
import { commentPersonas } from "@/lib/personas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Body = {
  tasks?: AdminRedditTask[]
  warmupTasks?: AdminRedditTask[][]
  personaSettings?: Array<{ personaId?: string; status?: string; warmupStartDate?: string }>
}

function normalizeTasks(tasks: AdminRedditTask[], category: "marketing" | "warmup", day?: number): AdminRedditTask[] {
  return tasks.map((task, index) => {
    const id =
      category === "warmup"
        ? `warmup-day-${day}-task-${String(index + 1).padStart(2, "0")}`
        : `task-${String(index + 1).padStart(2, "0")}`

    return {
      id,
      redditUrl: String(task?.redditUrl ?? "").trim(),
      postText: String(task?.postText ?? "").trim(),
      taskType: isAdminTaskType(task?.taskType) ? task.taskType : "comment",
      commentMode: task?.commentMode === "custom" || task?.commentMode === "freeform" ? task.commentMode : "ai",
      customComment: String(task?.customComment ?? "").trim(),
      taskCategory: category,
      warmupDay: category === "warmup" ? day ?? null : null,
    }
  })
}

function normalizePersonaSettings(settings: Body["personaSettings"]) {
  return commentPersonas.map((persona) => {
    const setting = Array.isArray(settings) ? settings.find((item) => item.personaId === persona.id) : null
    return {
      personaId: persona.id,
      status: setting?.status === "warmup" ? "warmup" as const : "marketing" as const,
      warmupStartDate: String(setting?.warmupStartDate ?? "").trim(),
    }
  })
}

export async function GET() {
  try {
    const config = await readAdminConfig()
    return Response.json({
      ...config,
      tasks: normalizeTasks(config.tasks, "marketing"),
      warmupTasks: Array.from({ length: 7 }, (_, index) => normalizeTasks(config.warmupTasks[index] ?? [], "warmup", index + 1)),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load admin tasks"
    return Response.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Body
    const current = await readAdminConfig()
    const tasks = normalizeTasks(Array.isArray(body.tasks) ? body.tasks : current.tasks, "marketing")
    const warmupTasks = Array.from({ length: 7 }, (_, index) =>
      normalizeTasks(
        Array.isArray(body.warmupTasks?.[index]) ? body.warmupTasks[index] : current.warmupTasks[index] ?? [],
        "warmup",
        index + 1,
      ),
    )
    const personaSettings = normalizePersonaSettings(body.personaSettings ?? current.personaSettings)

    await writeAdminConfig({
      ...current,
      tasks,
      warmupTasks,
      personaSettings,
      generatedTaskComments: [],
      updatedAt: new Date().toISOString(),
      generatedAt: null,
    })

    return Response.json({ ok: true, tasks, warmupTasks, personaSettings })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save admin tasks"
    return Response.json({ error: message }, { status: 500 })
  }
}
