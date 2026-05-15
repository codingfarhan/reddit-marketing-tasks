import type { AdminRedditTask } from "@/lib/admin-types"
import { readAdminConfig, writeAdminConfig } from "@/lib/admin-storage"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Body = {
  tasks?: AdminRedditTask[]
}

function normalizeTasks(tasks: AdminRedditTask[]): AdminRedditTask[] {
  return tasks.map((task, index) => {
    const id = `task-${String(index + 1).padStart(2, "0")}`

    return {
      id,
      redditUrl: String(task?.redditUrl ?? "").trim(),
      postText: String(task?.postText ?? "").trim(),
      commentMode: task?.commentMode === "custom" || task?.commentMode === "freeform" ? task.commentMode : "ai",
      customComment: String(task?.customComment ?? "").trim(),
    }
  })
}

export async function GET() {
  const config = await readAdminConfig()
  return Response.json({
    ...config,
    tasks: normalizeTasks(config.tasks),
  })
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Body
  const current = await readAdminConfig()
  const tasks = normalizeTasks(Array.isArray(body.tasks) ? body.tasks : current.tasks)

  await writeAdminConfig({
    ...current,
    tasks,
    generatedTaskComments: [],
    updatedAt: new Date().toISOString(),
    generatedAt: null,
  })

  return Response.json({ ok: true, tasks })
}
