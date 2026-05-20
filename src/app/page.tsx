"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { AdminConfig } from "@/lib/admin-types"
import { getTasksForPersona } from "@/lib/persona-groups"
import { commentPersonas } from "@/lib/personas"

type Step = "name" | "reddit" | "tasks" | "done"
type SavedProgress = {
  taskKey: string
  step: Exclude<Step, "done">
  nameQuery: string
  selectedPersonaId: string | null
  redditUsername: string
  taskIndex: number
  commentUrlByTaskId: Record<string, string>
}

const PROGRESS_STORAGE_KEY = "reddit-marketing-task-progress"

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total <= 0 ? 0 : Math.min(100, Math.round((current / total) * 100))
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-zinc-600">
        <span>
          Step {current} / {total}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-zinc-200">
        <div className="h-2 rounded-full bg-zinc-900 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function safeSegment(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
}

function getTaskKey(config: AdminConfig) {
  return JSON.stringify({
    generatedAt: config.generatedAt,
    tasks: config.tasks.map((task) => ({
      id: task.id,
      redditUrl: task.redditUrl,
      taskType: task.taskType,
    })),
    warmupTasks: config.warmupTasks.map((dayTasks) =>
      dayTasks.map((task) => ({
        id: task.id,
        redditUrl: task.redditUrl,
        taskType: task.taskType,
      })),
    ),
    personaSettings: config.personaSettings,
  })
}

function readSavedProgress(taskKey: string): SavedProgress | null {
  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SavedProgress>
    if (parsed.taskKey !== taskKey) return null
    if (parsed.step !== "name" && parsed.step !== "reddit" && parsed.step !== "tasks") return null

    return {
      taskKey,
      step: parsed.step,
      nameQuery: typeof parsed.nameQuery === "string" ? parsed.nameQuery : "",
      selectedPersonaId: typeof parsed.selectedPersonaId === "string" ? parsed.selectedPersonaId : null,
      redditUsername: typeof parsed.redditUsername === "string" ? parsed.redditUsername : "",
      taskIndex: typeof parsed.taskIndex === "number" ? parsed.taskIndex : 0,
      commentUrlByTaskId:
        parsed.commentUrlByTaskId && typeof parsed.commentUrlByTaskId === "object" ? parsed.commentUrlByTaskId : {},
    }
  } catch {
    return null
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

function getVisibleTasks(config: AdminConfig, personaId: string) {
  const personaSetting = config.personaSettings.find((setting) => setting.personaId === personaId)
  const warmupDay = personaSetting?.status === "warmup" ? getWarmupDay(personaSetting.warmupStartDate) : null
  return warmupDay ? config.warmupTasks[warmupDay - 1] ?? [] : getTasksForPersona(config.tasks, personaId)
}

export default function Home() {
  const [config, setConfig] = useState<AdminConfig | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [step, setStep] = useState<Step>("name")
  const [nameQuery, setNameQuery] = useState("")
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null)
  const [redditUsername, setRedditUsername] = useState("")
  const [taskIndex, setTaskIndex] = useState(0)
  const [commentUrlByTaskId, setCommentUrlByTaskId] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submissionId, setSubmissionId] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [showWarmupNotice, setShowWarmupNotice] = useState(false)
  const warmupNoticeKey = useRef<string | null>(null)
  const copyTimer = useRef<number | null>(null)
  const hasLoadedProgress = useRef(false)

  useEffect(() => {
    let alive = true
    async function loadConfig() {
      try {
        const res = await fetch("/api/admin/tasks", { cache: "no-store" })
        const data = (await res.json()) as AdminConfig & { error?: string }
        if (!res.ok) throw new Error(data.error || "Failed to load tasks")
        if (!alive) return
        setConfig(data)
        const saved = readSavedProgress(getTaskKey(data))
        if (saved) {
          setStep(saved.step)
          setNameQuery(saved.nameQuery)
          setSelectedPersonaId(saved.selectedPersonaId)
          setRedditUsername(saved.redditUsername)
          const savedPersonaTasks = saved.selectedPersonaId ? getVisibleTasks(data, saved.selectedPersonaId) : []
          setTaskIndex(Math.min(Math.max(saved.taskIndex, 0), Math.max(savedPersonaTasks.length - 1, 0)))
          setCommentUrlByTaskId(saved.commentUrlByTaskId)
        }
        hasLoadedProgress.current = true
      } catch (err) {
        if (!alive) return
        setLoadError(err instanceof Error ? err.message : "Failed to load tasks")
        hasLoadedProgress.current = true
      }
    }

    void loadConfig()
    return () => {
      alive = false
      if (copyTimer.current) window.clearTimeout(copyTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!config || !hasLoadedProgress.current || step === "done") return

    window.localStorage.setItem(
      PROGRESS_STORAGE_KEY,
      JSON.stringify({
        taskKey: getTaskKey(config),
        step,
        nameQuery,
        selectedPersonaId,
        redditUsername,
        taskIndex,
        commentUrlByTaskId,
      } satisfies SavedProgress),
    )
  }, [commentUrlByTaskId, config, nameQuery, redditUsername, selectedPersonaId, step, taskIndex])

  useEffect(() => {
    if (countdown === null) return

    const timer = window.setTimeout(() => {
      setCountdown((current) => {
        if (current === null) return null
        if (current <= 1) {
          setTaskIndex((task) => task + 1)
          setCopied(false)
          return null
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [countdown])

  const selectedPersona = commentPersonas.find((persona) => persona.id === selectedPersonaId) ?? null
  const allTasks = config?.tasks ?? []
  const personaSetting = selectedPersona ? config?.personaSettings.find((setting) => setting.personaId === selectedPersona.id) : null
  const warmupDay = personaSetting?.status === "warmup" ? getWarmupDay(personaSetting.warmupStartDate) : null
  const tasks =
    selectedPersona && config
      ? warmupDay
        ? config.warmupTasks[warmupDay - 1] ?? []
        : getTasksForPersona(allTasks, selectedPersona.id)
      : []
  const activeTask = tasks[taskIndex] ?? null
  const activeGeneratedComment =
    activeTask && selectedPersona && config
      ? config.generatedTaskComments
          .find((item) => item.taskId === activeTask.id)
          ?.comments.find((comment) => comment.personaId === selectedPersona.id)?.comment ?? ""
      : ""
  const filteredPersonas = useMemo(() => {
    const query = nameQuery.trim().toLowerCase()
    if (!query) return []
    return commentPersonas.filter((persona) => persona.name.toLowerCase().includes(query))
  }, [nameQuery])
  const completedTasks = tasks.filter((task) => commentUrlByTaskId[task.id]?.trim()).length
  const totalSteps = 2 + Math.max(tasks.length, 1)
  const currentStep = step === "name" ? 1 : step === "reddit" ? 2 : step === "done" ? totalSteps : 3 + taskIndex

  useEffect(() => {
    if (step !== "tasks" || warmupDay !== 1 || taskIndex !== 0 || !selectedPersonaId) return

    const noticeKey = `${selectedPersonaId}:warmup-day-1`
    if (warmupNoticeKey.current === noticeKey) return
    warmupNoticeKey.current = noticeKey
    setShowWarmupNotice(true)
  }, [selectedPersonaId, step, taskIndex, warmupDay])

  function choosePersona(personaId: string) {
    const persona = commentPersonas.find((item) => item.id === personaId)
    if (!persona) return
    setSelectedPersonaId(persona.id)
    setNameQuery(persona.name)
    setTaskIndex(0)
    setSubmitError(null)
  }

  function goToRedditStep() {
    if (!selectedPersona) {
      setSubmitError("Select your name from the dropdown.")
      return
    }
    setSubmitError(null)
    setStep("reddit")
  }

  function startTasks() {
    if (!redditUsername.trim()) {
      setSubmitError("Enter your Reddit username.")
      return
    }
    if (tasks.length === 0) {
      setSubmitError("No tasks are available for your account today.")
      return
    }
    setSubmitError(null)
    setTaskIndex(0)
    setStep("tasks")
  }

  function validateCommentUrl(value: string) {
    try {
      const parsed = new URL(value)
      return parsed.protocol === "http:" || parsed.protocol === "https:"
    } catch {
      return false
    }
  }

  async function submitAll() {
    if (!selectedPersona || !config) return
    const missing = tasks.find((task) => !commentUrlByTaskId[task.id]?.trim())
    if (missing) {
      setSubmitError(missing.taskType === "comment" ? `Missing Reddit comment URL for ${missing.id}.` : `Missing screenshot for ${missing.id}.`)
      return
    }

    try {
      setIsSubmitting(true)
      setSubmitError(null)
      const sid = `${new Date().toISOString().replace(/[:.]/g, "-")}_${safeSegment(selectedPersona.name)}_${safeSegment(redditUsername)}_${crypto.randomUUID()}`
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: sid,
          name: selectedPersona.name,
          redditUsername: redditUsername.trim(),
          personaId: selectedPersona.id,
          tasks: tasks.map((task) => ({
            taskId: task.id,
            generatedComment:
              config.generatedTaskComments
                .find((item) => item.taskId === task.id)
                ?.comments.find((comment) => comment.personaId === selectedPersona.id)?.comment ?? null,
            commentUrl: commentUrlByTaskId[task.id]?.trim() ?? "",
          })),
        }),
      })
      const data = (await res.json()) as { ok?: boolean; submissionId?: string; error?: string }
      if (!res.ok || !data.ok || !data.submissionId) throw new Error(data.error || "Submission failed")
      window.localStorage.removeItem(PROGRESS_STORAGE_KEY)
      setSubmissionId(data.submissionId)
      setStep("done")
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  function goNextTask() {
    if (!activeTask) return
    const commentUrl = commentUrlByTaskId[activeTask.id]?.trim() ?? ""
    if (!commentUrl) {
      setSubmitError(activeTask.taskType === "comment" ? "Paste the Reddit comment URL to continue." : "Upload a screenshot to continue.")
      return
    }
    if (activeTask.taskType === "comment" && !validateCommentUrl(commentUrl)) {
      setSubmitError("Enter a valid Reddit comment URL.")
      return
    }
    if (taskIndex === tasks.length - 1) {
      void submitAll()
      return
    }
    setSubmitError(null)
    setCountdown(30)
  }

  async function copyComment() {
    if (!activeGeneratedComment) return
    await navigator.clipboard.writeText(activeGeneratedComment)
    setCopied(true)
    if (copyTimer.current) window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(false), 1500)
  }

  const setupIncomplete =
    !loadError &&
    config &&
    ([...allTasks, ...(config?.warmupTasks.flat() ?? [])].length === 0 ||
      [...allTasks, ...(config?.warmupTasks.flat() ?? [])].some(
        (task) =>
          !task.redditUrl ||
          (task.taskType !== "comment"
            ? false
            : task.commentMode === "custom"
            ? !task.customComment
            : task.commentMode === "freeform"
              ? false
              : !task.postText),
      ) ||
      [...allTasks, ...(config?.warmupTasks.flat() ?? [])].some(
        (task) =>
          task.taskType === "comment" &&
          task.commentMode !== "freeform" &&
          !config.generatedTaskComments.find((item) => item.taskId === task.id),
      ))

  return (
    <main className="min-h-dvh bg-zinc-50 px-4 py-6 text-zinc-950">
      <div className="mx-auto max-w-xl">
        {showWarmupNotice && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/60 px-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
              <h2 className="text-lg font-semibold">Before you start warmup</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-700">
                Please make sure you are using a new Reddit account for the account warm up process. If your last account
                was on your mobile phone, please use your laptop or any other device for creating the new Reddit account
                and completing these tasks.
              </p>
              <button
                type="button"
                onClick={() => setShowWarmupNotice(false)}
                className="mt-5 w-full rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                I understand
              </button>
            </div>
          </div>
        )}

        <header className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Task Submission</h1>
          <p className="mt-1 text-sm text-zinc-600">Select your assigned name and submit Reddit comment links.</p>
          <div className="mt-4">
            <ProgressBar current={currentStep} total={totalSteps} />
          </div>
        </header>

        <section className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          {!config && !loadError && <p className="text-sm text-zinc-600">Loading tasks...</p>}
          {loadError && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{loadError}</p>}
          {setupIncomplete && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Tasks are not ready yet. Please check back after admin generates comments.
            </p>
          )}

          {config && !setupIncomplete && step === "name" && (
            <div>
              <h2 className="text-base font-semibold">Select your name</h2>
              <input
                autoFocus
                value={nameQuery}
                onChange={(event) => {
                  setNameQuery(event.target.value)
                  setSelectedPersonaId(null)
                }}
                placeholder="Start typing your name"
                className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10"
              />
              {nameQuery.trim() && (
                <div className="mt-3 max-h-72 overflow-y-auto rounded-xl border border-zinc-200">
                  {filteredPersonas.map((persona) => (
                    <button
                      key={persona.id}
                      type="button"
                      onClick={() => choosePersona(persona.id)}
                      className={`block w-full px-3 py-2.5 text-left text-sm transition hover:bg-zinc-50 ${selectedPersonaId === persona.id ? "bg-zinc-900 text-white hover:bg-zinc-900" : ""}`}
                    >
                      {persona.name}
                    </button>
                  ))}
                  {filteredPersonas.length === 0 && <p className="px-3 py-2.5 text-sm text-zinc-500">No matching names</p>}
                </div>
              )}
              {submitError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{submitError}</p>}
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={goToRedditStep}
                  className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {config && !setupIncomplete && step === "reddit" && (
            <div>
              <h2 className="text-base font-semibold">Enter Reddit username</h2>
              <input
                autoFocus
                value={redditUsername}
                onChange={(event) => setRedditUsername(event.target.value)}
                placeholder="u/yourname"
                className="mt-4 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10"
              />
              {submitError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{submitError}</p>}
              <div className="mt-5 flex justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setStep("name")}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-zinc-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={startTasks}
                  className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  Start tasks
                </button>
              </div>
            </div>
          )}

          {config && !setupIncomplete && step === "tasks" && !activeTask && (
            <div>
              <h2 className="text-base font-semibold">No tasks available</h2>
              <p className="mt-2 text-sm text-zinc-600">There are no tasks assigned to your account today.</p>
              <button
                type="button"
                onClick={() => setStep("name")}
                className="mt-5 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-zinc-50"
              >
                Back
              </button>
            </div>
          )}

          {config && !setupIncomplete && step === "tasks" && activeTask && (
            <div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">
                    Task {taskIndex + 1} <span className="text-zinc-500">/ {tasks.length}</span>
                  </h2>
                  <a
                    href={activeTask.redditUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block break-all font-mono text-xs text-zinc-700 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900"
                  >
                    {activeTask.redditUrl}
                  </a>
                </div>
                {activeTask.taskType === "comment" && activeTask.commentMode !== "freeform" && (
                  <button
                    type="button"
                    onClick={copyComment}
                    disabled={!activeGeneratedComment}
                    className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      copied ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
                    }`}
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                )}
              </div>

              {activeTask.taskType !== "comment" ? (
                <p className="mt-4 rounded-xl bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700">
                  {activeTask.taskType === "upvote" ? "Upvote this post, then upload a screenshot." : "Join this subreddit, then upload a screenshot."}
                </p>
              ) : activeTask.commentMode === "freeform" ? (
                <p className="mt-4 rounded-xl bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700">
                  Write any comment you think fits this post.
                </p>
              ) : (
                <textarea
                  value={activeGeneratedComment}
                  readOnly
                  rows={5}
                  className="mt-4 w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-800 outline-none"
                />
              )}

              {activeTask.taskType === "comment" ? (
                <>
                  <label className="mt-4 block text-sm font-medium">Reddit comment URL</label>
                  <input
                    value={commentUrlByTaskId[activeTask.id] ?? ""}
                    onChange={(event) => {
                      setSubmitError(null)
                      setCommentUrlByTaskId((prev) => ({ ...prev, [activeTask.id]: event.target.value }))
                    }}
                    placeholder="https://www.reddit.com/r/.../comments/..."
                    inputMode="url"
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10"
                  />
                </>
              ) : (
                <>
                  <label className="mt-4 block text-sm font-medium">Upload screenshot</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(event) => {
                      setSubmitError(null)
                      if (event.target.files?.[0]) {
                        setCommentUrlByTaskId((prev) => ({ ...prev, [activeTask.id]: "screenshot submitted" }))
                      }
                    }}
                    className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm"
                  />
                  {commentUrlByTaskId[activeTask.id] && <p className="mt-2 text-sm text-emerald-700">Screenshot selected. It will not be uploaded.</p>}
                </>
              )}

              {submitError && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{submitError}</p>}

              <div className="mt-5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (taskIndex === 0) setStep("reddit")
                    else setTaskIndex((current) => current - 1)
                    setSubmitError(null)
                  }}
                  disabled={isSubmitting || countdown !== null}
                  className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Back
                </button>
                <span className="text-xs text-zinc-500">
                  {completedTasks}/{tasks.length} done
                </span>
                <button
                  type="button"
                  onClick={goNextTask}
                  disabled={isSubmitting || countdown !== null}
                  className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {taskIndex === tasks.length - 1 ? (isSubmitting ? "Submitting..." : "Submit") : "Next"}
                </button>
              </div>

              {countdown !== null && (
                <div className="mt-5 rounded-2xl bg-zinc-900 px-4 py-6 text-center text-white">
                  <p className="text-sm text-zinc-300">Waiting before the next task to help prevent Reddit rate limits</p>
                  <p className="mt-2 text-6xl font-semibold tabular-nums">{countdown}</p>
                  <p className="mt-2 text-sm text-zinc-300">seconds</p>
                </div>
              )}
            </div>
          )}

          {step === "done" && (
            <div>
              <h2 className="text-base font-semibold">Submitted</h2>
              <p className="mt-2 text-sm text-zinc-600">Your links have been saved.</p>
              <p className="mt-4 break-all rounded-xl bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-700">{submissionId}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
