import { readAdminConfig } from "@/lib/admin-storage"
import { commentPersonas } from "@/lib/personas"
import { readSubmissions, type SavedSubmission } from "@/lib/submissions-db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export default async function SubmissionsPage() {
  const [metas, adminConfig] = await Promise.all([readSubmissions(), readAdminConfig()])
  const latestByName = new Map<string, SavedSubmission>()
  for (const meta of metas) {
    const key = meta.personaId || meta.name.toLowerCase()
    const existing = latestByName.get(key)
    if (!existing || existing.submittedAt < meta.submittedAt) latestByName.set(key, meta)
  }
  const rows = Array.from(latestByName.values()).sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
  const submittedPersonaIds = new Set(rows.map((row) => row.personaId))
  const missingPersonas = commentPersonas.filter((persona) => !submittedPersonaIds.has(persona.id))
  const commentUrlCount = rows.reduce((total, meta) => total + (meta.tasks?.length ?? 0), 0)
  const adminColumns = adminConfig.tasks.map((task, index) => ({
    id: task.id,
    label: `Task ${index + 1}`,
  }))
  const savedTaskIds = Array.from(new Set(rows.flatMap((row) => row.tasks.map((task) => task.taskId))))
  const taskColumns =
    adminColumns.length > 0
      ? adminColumns
      : savedTaskIds.map((taskId, index) => ({
          id: taskId,
          label: `Task ${index + 1}`,
        }))

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Submissions</h1>
          <p className="mt-1 text-sm text-zinc-600">Reading submissions from the database.</p>
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold">Not submitted yet</h2>
          {missingPersonas.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-600">Everyone has submitted.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {missingPersonas.map((persona) => (
                <span key={persona.id} className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-700">
                  {persona.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
            <div>
              <p className="text-sm font-semibold">Comment URLs</p>
              <p className="text-xs text-zinc-600">
                {rows.length} name{rows.length === 1 ? "" : "s"} • {commentUrlCount} comment URL
                {commentUrlCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1200px] w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Reddit</th>
                  {taskColumns.map((task) => (
                    <th key={task.id} className="px-4 py-3">
                      {task.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-zinc-600" colSpan={3 + taskColumns.length}>
                      No submissions found yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((submission) => {
                    const commentByTaskId = new Map((submission.tasks ?? []).map((task) => [task.taskId, task.commentUrl]))

                    return (
                    <tr key={submission.submissionId} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-zinc-600">
                        {new Date(submission.submittedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-medium">{submission.name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{submission.redditUsername}</td>
                      {taskColumns.map((task) => {
                        const commentUrl = commentByTaskId.get(task.id) ?? ""

                        return (
                          <td key={task.id} className="px-4 py-3 font-mono text-xs text-zinc-700 break-all">
                            {commentUrl.startsWith("http") ? (
                              <a
                                className="underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900"
                                href={commentUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {commentUrl}
                              </a>
                            ) : (
                              <span className="text-zinc-400">-</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
