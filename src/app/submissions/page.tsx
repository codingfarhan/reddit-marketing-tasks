import { readFile } from "node:fs/promises"
import { getSubmissionsFileLabel, getSubmissionsFilePath } from "@/lib/submissions-storage"
import { redditTasks } from "@/lib/tasks"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type MetaTask = {
  taskId: string
  redditUrl: string
  exampleComment: string
  generatedComment: string | null
  commentUrl: string
}

type SubmissionMeta = {
  submissionId: string
  submittedAt: string
  name: string
  redditUsername: string
  tasks: MetaTask[]
}

const submissionsFile = getSubmissionsFilePath()

async function readSubmissionMetas(): Promise<SubmissionMeta[]> {
  try {
    const raw = await readFile(submissionsFile, "utf8")
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return (parsed as SubmissionMeta[]).sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
  } catch {
    return []
  }
}

export default async function SubmissionsPage() {
  const metas = await readSubmissionMetas()
  const submissionsFileLabel = getSubmissionsFileLabel()
  const commentUrlCount = metas.reduce((total, meta) => total + (meta.tasks?.length ?? 0), 0)

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Submissions</h1>
          <p className="mt-1 text-sm text-zinc-600">Reading from {submissionsFileLabel}.</p>
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
            <div>
              <p className="text-sm font-semibold">Comment URLs</p>
              <p className="text-xs text-zinc-600">
                {metas.length} submission{metas.length === 1 ? "" : "s"} • {commentUrlCount} comment URL
                {commentUrlCount === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[2600px] w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Reddit</th>
                  {redditTasks.map((task) => (
                    <th key={task.id} className="px-4 py-3">
                      {task.title}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {metas.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-zinc-600" colSpan={3 + redditTasks.length}>
                      No submissions found yet.
                    </td>
                  </tr>
                ) : (
                  metas.map((submission) => {
                    const commentByTaskId = new Map((submission.tasks ?? []).map((task) => [task.taskId, task.commentUrl]))

                    return (
                    <tr key={submission.submissionId} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-zinc-600">
                        {new Date(submission.submittedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-medium">{submission.name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{submission.redditUsername}</td>
                      {redditTasks.map((task) => {
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
