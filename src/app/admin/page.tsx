"use client"

import { useEffect, useMemo, useState } from "react"
import type { AdminConfig, AdminRedditTask, PersonaSetting } from "@/lib/admin-types"
import { getTaskGroup } from "@/lib/persona-groups"
import { commentPersonas } from "@/lib/personas"

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
    taskType: "comment",
    commentMode: "ai",
    customComment: "",
    taskCategory: "marketing",
    warmupDay: null,
  }
}

function createWarmupTask(day: number, index: number): AdminRedditTask {
  return {
    ...createTask(index),
    id: `warmup-day-${day}-task-${String(index + 1).padStart(2, "0")}`,
    taskCategory: "warmup",
    warmupDay: day,
  }
}

function defaultPersonaSettings(): PersonaSetting[] {
  return commentPersonas.map((persona) => ({
    personaId: persona.id,
    status: "marketing",
    warmupStartDate: "",
  }))
}

async function readJsonResponse<T>(res: Response): Promise<T & { error?: string }> {
  const text = await res.text()
  if (!text) return {} as T & { error?: string }

  try {
    return JSON.parse(text) as T & { error?: string }
  } catch {
    return { error: text } as T & { error?: string }
  }
}

export default function AdminPage() {
  const [tasks, setTasks] = useState<AdminRedditTask[]>(createEmptyTasks)
  const [warmupTasks, setWarmupTasks] = useState<AdminRedditTask[][]>(Array.from({ length: 7 }, () => []))
  const [personaSettings, setPersonaSettings] = useState<PersonaSetting[]>(defaultPersonaSettings)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>({ kind: "loading", message: "Loading tasks..." })

  const completedCount = useMemo(() => {
    const allTasks = [...tasks, ...warmupTasks.flat()]
    return allTasks.filter(
      (task) =>
        task.redditUrl.trim() &&
        (task.taskType !== "comment"
          ? true
          : task.commentMode === "custom"
          ? task.customComment.trim()
          : task.commentMode === "freeform"
            ? true
            : task.postText.trim()),
    ).length
  }, [tasks, warmupTasks])
  const totalTaskCount = tasks.length + warmupTasks.flat().length
  const canGenerate = totalTaskCount > 0 && completedCount === totalTaskCount && status.kind !== "saving" && status.kind !== "generating"

  useEffect(() => {
    let alive = true

    async function load() {
      try {
        const res = await fetch("/api/admin/tasks", { cache: "no-store" })
        const data = (await res.json()) as AdminConfig & { error?: string }
        if (!res.ok) throw new Error(data.error || "Failed to load admin tasks")
        if (!alive) return
        setTasks(Array.isArray(data.tasks) && data.tasks.length > 0 ? data.tasks : createEmptyTasks())
        setWarmupTasks(Array.isArray(data.warmupTasks) ? data.warmupTasks : Array.from({ length: 7 }, () => []))
        setPersonaSettings(Array.isArray(data.personaSettings) && data.personaSettings.length > 0 ? data.personaSettings : defaultPersonaSettings())
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

  function updateWarmupTask(dayIndex: number, taskIndex: number, patch: Partial<AdminRedditTask>) {
    setWarmupTasks((prev) =>
      prev.map((dayTasks, currentDayIndex) =>
        currentDayIndex === dayIndex
          ? dayTasks.map((task, currentTaskIndex) => (currentTaskIndex === taskIndex ? { ...task, ...patch } : task))
          : dayTasks,
      ),
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

  function addWarmupTask(dayIndex: number) {
    setWarmupTasks((prev) =>
      prev.map((dayTasks, currentDayIndex) =>
        currentDayIndex === dayIndex ? [...dayTasks, createWarmupTask(dayIndex + 1, dayTasks.length)] : dayTasks,
      ),
    )
  }

  function removeWarmupTask(dayIndex: number, taskIndex: number) {
    setWarmupTasks((prev) =>
      prev.map((dayTasks, currentDayIndex) =>
        currentDayIndex === dayIndex
          ? dayTasks
              .filter((_, currentTaskIndex) => currentTaskIndex !== taskIndex)
              .map((task, currentTaskIndex) => ({
                ...task,
                id: `warmup-day-${dayIndex + 1}-task-${String(currentTaskIndex + 1).padStart(2, "0")}`,
              }))
          : dayTasks,
      ),
    )
  }

  function updatePersonaSetting(personaId: string, patch: Partial<PersonaSetting>) {
    setPersonaSettings((prev) =>
      prev.map((setting) => (setting.personaId === personaId ? { ...setting, ...patch } : setting)),
    )
  }

  async function saveTasks() {
    setStatus({ kind: "saving", message: "Saving tasks..." })
    try {
      const res = await fetch("/api/admin/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tasks, warmupTasks, personaSettings }),
      })
      const data = await readJsonResponse<{
        tasks?: AdminRedditTask[]
        warmupTasks?: AdminRedditTask[][]
        personaSettings?: PersonaSetting[]
      }>(res)
      if (!res.ok) throw new Error(data.error || "Failed to save tasks")
      if (data.tasks) setTasks(data.tasks)
      if (data.warmupTasks) setWarmupTasks(data.warmupTasks)
      if (data.personaSettings) setPersonaSettings(data.personaSettings)
      setGeneratedAt(null)
      setStatus({ kind: "success", message: "Tasks saved. Generated comments were reset." })
      return data.tasks ?? tasks
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Failed to save tasks" })
      throw err
    }
  }

  async function generateComments() {
    setStatus({ kind: "generating", message: `Generating comments across ${totalTaskCount} tasks. This can take a bit...` })
    try {
      await saveTasks()
      setStatus({ kind: "generating", message: `Generating comments across ${totalTaskCount} tasks. This can take a bit...` })
      const res = await fetch("/api/admin/generate", { method: "POST" })
      const data = (await res.json()) as { generatedAt?: string; error?: string }
      if (!res.ok) throw new Error(data.error || "Failed to generate comments")
      setGeneratedAt(data.generatedAt ?? new Date().toISOString())
      setStatus({ kind: "success", message: `Generated comments across ${totalTaskCount} task${totalTaskCount === 1 ? "" : "s"}.` })
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
              {completedCount}/{totalTaskCount} task{totalTaskCount === 1 ? "" : "s"} complete
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
                <h2 className="text-sm font-semibold">
                  Task {index + 1} <span className="text-zinc-500">• {getTaskGroup(index, tasks.length) === "group_1" ? "Group 1" : "Group 2"}</span>
                </h2>
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

              <label className="mt-4 block text-sm font-medium">Task type</label>
              <select
                value={task.taskType}
                onChange={(event) =>
                  updateTask(index, {
                    taskType:
                      event.target.value === "upvote" || event.target.value === "join_subreddit"
                        ? event.target.value
                        : "comment",
                  })
                }
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10"
              >
                <option value="comment">Comment task</option>
                <option value="upvote">Upvote this post</option>
                <option value="join_subreddit">Join a subreddit</option>
              </select>

              {task.taskType === "comment" && (
                <>
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

        <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Persona warmup status</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {commentPersonas.map((persona) => {
              const setting = personaSettings.find((item) => item.personaId === persona.id) ?? {
                personaId: persona.id,
                status: "marketing" as const,
                warmupStartDate: "",
              }

              return (
                <div key={persona.id} className="rounded-xl border border-zinc-200 p-3">
                  <p className="text-sm font-semibold">{persona.name}</p>
                  <select
                    value={setting.status}
                    onChange={(event) =>
                      updatePersonaSetting(persona.id, {
                        status: event.target.value === "warmup" ? "warmup" : "marketing",
                      })
                    }
                    className="mt-2 w-full rounded-lg border border-zinc-200 px-2 py-2 text-sm"
                  >
                    <option value="marketing">Ready for marketing tasks</option>
                    <option value="warmup">Account warmup</option>
                  </select>
                  {setting.status === "warmup" && (
                    <input
                      type="date"
                      value={setting.warmupStartDate}
                      onChange={(event) => updatePersonaSetting(persona.id, { warmupStartDate: event.target.value })}
                      className="mt-2 w-full rounded-lg border border-zinc-200 px-2 py-2 text-sm"
                    />
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section className="mt-8 space-y-5">
          <h2 className="text-lg font-semibold">7 day account warmup tasks</h2>
          {warmupTasks.map((dayTasks, dayIndex) => (
            <div key={dayIndex} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold">Day {dayIndex + 1}</h3>
              <div className="mt-4 space-y-4">
                {dayTasks.map((task, taskIndex) => (
                  <div key={task.id} className="rounded-xl border border-zinc-200 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">Task {taskIndex + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeWarmupTask(dayIndex, taskIndex)}
                        className="text-xs font-semibold text-red-700"
                      >
                        Remove
                      </button>
                    </div>
                    <input
                      value={task.redditUrl}
                      onChange={(event) => updateWarmupTask(dayIndex, taskIndex, { redditUrl: event.target.value })}
                      placeholder="reddit link or subreddit link"
                      className="mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm"
                    />
                    <textarea
                      value={task.postText}
                      onChange={(event) => updateWarmupTask(dayIndex, taskIndex, { postText: event.target.value })}
                      rows={3}
                      placeholder="post text or instruction"
                      className="mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm"
                    />
                    <select
                      value={task.taskType}
                      onChange={(event) =>
                        updateWarmupTask(dayIndex, taskIndex, {
                          taskType:
                            event.target.value === "upvote" || event.target.value === "join_subreddit"
                              ? event.target.value
                              : "comment",
                        })
                      }
                      className="mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm"
                    >
                      <option value="comment">Comment task</option>
                      <option value="upvote">Upvote this post</option>
                      <option value="join_subreddit">Join a subreddit</option>
                    </select>

                    {task.taskType === "comment" && (
                      <>
                        <select
                          value={task.commentMode}
                          onChange={(event) =>
                            updateWarmupTask(dayIndex, taskIndex, {
                              commentMode:
                                event.target.value === "custom" || event.target.value === "freeform"
                                  ? event.target.value
                                  : "ai",
                            })
                          }
                          className="mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm"
                        >
                          <option value="ai">AI-generated comments</option>
                          <option value="custom">Custom admin comment</option>
                          <option value="freeform">No preset comment</option>
                        </select>

                        {task.commentMode === "custom" && (
                          <textarea
                            value={task.customComment}
                            onChange={(event) => updateWarmupTask(dayIndex, taskIndex, { customComment: event.target.value })}
                            rows={3}
                            placeholder="custom comment for this warmup task"
                            className="mt-3 w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm"
                          />
                        )}
                      </>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => addWarmupTask(dayIndex)}
                  className="w-full rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-sm font-semibold"
                >
                  Add day {dayIndex + 1} task
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
