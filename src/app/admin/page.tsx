"use client"

import { useEffect, useMemo, useState } from "react"
import type { AdminConfig, AdminRedditTask } from "@/lib/admin-types"

type Status = {
  kind: "idle" | "loading" | "saving" | "generating" | "success" | "error"
  message: string
}

function createEmptyTasks(): AdminRedditTask[] {
  return [createTask(0)]
}

function createTask(index: number): AdminRedditTask {
  return {
    id: `task-${String(index + 1).padStart(2, "0")}`,
    redditUrl: "",
    postText: "",
    commentMode: "ai",
    customComment: "",
  }
}

export default function AdminPage() {
  const [tasks, setTasks] = useState<AdminRedditTask[]>(createEmptyTasks)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ kind: "loading", message: "Loading tasks..." })

  const completedCount = useMemo(() => {
    return tasks.filter(
      (task) =>
        task.redditUrl.trim() &&
        (task.commentMode === "custom"
          ? task.customComment.trim()
          : task.commentMode === "freeform"
            ? true
            : task.postText.trim()),
    ).length
  }, [tasks])
  const canGenerate = tasks.length > 0 && completedCount === tasks.length && status.kind !== "saving" && status.kind !== "generating"

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const res = await fetch("/api/admin/tasks", { cache: "no-store" })
        const data = (await res.json()) as AdminConfig & { error?: string }
        if (!res.ok) throw new Error(data.error || "Failed to load admin tasks")
        if (!alive) return
        setTasks(Array.isArray(data.tasks) && data.tasks.length > 0 ? data.tasks : createEmptyTasks())
        setGeneratedAt(data.generatedAt)
        setStatus({ kind: "idle", message: "" })
      } catch (err) {
        if (!alive) return
        setStatus({ kind: "error", message: err instanceof Error ? err.message : "Failed to load admin tasks" })
      }
    }

    void load()
    return () => {
      alive = false
    }
  }, [])

  function updateTask(index: number, patch: Partial<AdminRedditTask>) {
    setTasks((prev) =>
      prev.map((task, currentIndex) => (currentIndex === index ? { ...task, ...patch } : task)),
    )
  }

  function addTask() {
    setTasks((prev) => [...prev, createTask(prev.length)])
    setGeneratedAt(null)
    setStatus({ kind: "idle", message: "" })
  }

  function removeTask(index: number) {
    setTasks((prev) =>
      prev
        .filter((_, currentIndex) => currentIndex !== index)
        .map((task, currentIndex) => ({ ...task, id: `task-${String(currentIndex + 1).padStart(2, "0")}` })),
    )
    setGeneratedAt(null)
  }

  async function saveTasks() {
    setStatus({ kind: "saving", message: "Saving tasks..." })
    try {
      const res = await fetch("/api/admin/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks }),
      })
      const data = (await res.json()) as { tasks?: AdminRedditTask[]; error?: string }
      if (!res.ok) throw new Error(data.error || "Failed to save tasks")
      if (data.tasks) setTasks(data.tasks)
      setGeneratedAt(null)
      setStatus({ kind: "success", message: "Tasks saved. Generated comments were reset." })
      return data.tasks ?? tasks
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Failed to save tasks" })
      throw err
    }
  }

  async function generateComments() {
    setStatus({ kind: "generating", message: `Generating comments for 15 personas across ${tasks.length} tasks. This can take a bit...` })
    try {
      await saveTasks()
      setStatus({ kind: "generating", message: `Generating comments for 15 personas across ${tasks.length} tasks. This can take a bit...` })
      const res = await fetch("/api/admin/generate", { method: "POST" })
      const data = (await res.json()) as { generatedAt?: string; error?: string }
      if (!res.ok) throw new Error(data.error || "Failed to generate comments")
      setGeneratedAt(data.generatedAt ?? new Date().toISOString())
      setStatus({ kind: "success", message: `Generated comments for all 15 personas and ${tasks.length} task${tasks.length === 1 ? "" : "s"}.` })
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Failed to generate comments" })
    }
  }

  return (
    <main className="min-h-dvh bg-zinc-50 px-4 py-8 text-zinc-950">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-4 border-b border-zinc-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Add Reddit tasks, then generate persona-specific comments.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={saveTasks}
              disabled={status.kind === "saving" || status.kind === "generating"}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Save tasks
            </button>
            <button
              type="button"
              onClick={generateComments}
              disabled={!canGenerate}
              className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Generate comments
            </button>
          </div>
        </header>

        <section className="mt-5 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold">
              {completedCount}/{tasks.length} task{tasks.length === 1 ? "" : "s"} complete
            </p>
            {generatedAt && <p className="text-xs text-zinc-600">Generated at {new Date(generatedAt).toLocaleString()}</p>}
          </div>
          {status.message && (
            <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${status.kind === "error" ? "bg-red-50 text-red-800" : "bg-zinc-50 text-zinc-700"}`}>
              {status.message}
            </p>
          )}
        </section>

        <section className="mt-5 space-y-4">
          {tasks.map((task, index) => (
            <div key={task.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold">Task {index + 1}</h2>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs text-zinc-500">{task.id}</span>
                  {tasks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeTask(index)}
                      disabled={status.kind === "saving" || status.kind === "generating"}
                      className="text-xs font-semibold text-red-700 transition hover:text-red-900 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>

              <label className="mt-4 block text-sm font-medium">Reddit post link</label>
              <input
                value={task.redditUrl}
                onChange={(event) => updateTask(index, { redditUrl: event.target.value })}
                placeholder="https://www.reddit.com/r/..."
                inputMode="url"
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10"
              />

              <label className="mt-4 block text-sm font-medium">Actual Reddit post text</label>
              <textarea
                value={task.postText}
                onChange={(event) => updateTask(index, { postText: event.target.value })}
                rows={5}
                placeholder="Paste the post body/title/context here"
                className="mt-2 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10"
              />

              <label className="mt-4 block text-sm font-medium">Comment source</label>
              <select
                value={task.commentMode}
                onChange={(event) =>
                  updateTask(index, {
                    commentMode:
                      event.target.value === "custom" || event.target.value === "freeform"
                        ? event.target.value
                        : "ai",
                  })
                }
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10"
              >
                <option value="ai">AI-generated comments</option>
                <option value="custom">Custom admin comment</option>
                <option value="freeform">No preset comment</option>
              </select>

              {task.commentMode === "custom" && (
                <>
                  <label className="mt-4 block text-sm font-medium">Custom comment</label>
                  <textarea
                    value={task.customComment}
                    onChange={(event) => updateTask(index, { customComment: event.target.value })}
                    rows={4}
                    placeholder="This same comment will be shown for every persona on this task"
                    className="mt-2 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10"
                  />
                </>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={addTask}
            disabled={status.kind === "saving" || status.kind === "generating"}
            className="w-full rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-4 text-sm font-semibold text-zinc-900 transition hover:border-zinc-500 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add task
          </button>
        </section>
      </div>
    </main>
  )
}
