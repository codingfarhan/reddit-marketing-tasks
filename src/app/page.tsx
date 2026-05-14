"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { redditTasks } from "@/lib/tasks"

type Step = { kind: "pickName" } | { kind: "redditUsername" } | { kind: "task"; index: number } | { kind: "done"; submissionId: string }

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total <= 0 ? 0 : Math.min(100, Math.round((current / total) * 100))
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-zinc-600">
        <span>
          Step {current} / {total}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="mt-2 h-2 w-full rounded-full bg-zinc-200">
        <div className="h-2 rounded-full bg-zinc-900 transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function Home() {
  const totalSteps = 2 + redditTasks.length

  const [name, setName] = useState("")
  const [redditUsername, setRedditUsername] = useState("")
  const [step, setStep] = useState<Step>({ kind: "pickName" })
  const [commentUrlByTaskId, setCommentUrlByTaskId] = useState<Record<string, string>>({})
  const [generatedCommentByTaskId, setGeneratedCommentByTaskId] = useState<Record<string, string>>({})
  const [generatingTaskId, setGeneratingTaskId] = useState<string | null>(null)
  const [commentErrorByTaskId, setCommentErrorByTaskId] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submissionId, setSubmissionId] = useState<string | null>(null)

  const autoGenAttemptedRef = useRef<Record<string, boolean>>({})
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null)
  const copiedTimerRef = useRef<number | null>(null)

  const activeTaskIndex = step.kind === "task" ? step.index : null
  const activeTask = activeTaskIndex === null ? null : redditTasks[activeTaskIndex]

  const canContinueFromName = name.trim().length > 0
  const canContinueFromReddit = redditUsername.trim().length > 0

  const currentStepNumber = useMemo(() => {
    if (step.kind === "pickName") return 1
    if (step.kind === "redditUsername") return 2
    if (step.kind === "task") return 3 + step.index
    return totalSteps
  }, [step, totalSteps])

  function safeSegment(input: string) {
    return input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60)
  }

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current)
    }
  }, [])

  const activeTaskId = activeTask?.id ?? null
  const activeTaskComment = activeTaskId ? generatedCommentByTaskId[activeTaskId] : undefined

  useEffect(() => {
    if (step.kind !== "task") return
    const taskIndex = activeTaskIndex
    if (taskIndex === null) return
    const task = redditTasks[taskIndex]
    if (!task) return
    if (activeTaskComment?.trim()) return
    if (autoGenAttemptedRef.current[task.id]) return

    const controller = new AbortController()
    let didTimeout = false
    const timeoutId = window.setTimeout(() => {
      didTimeout = true
      controller.abort()
    }, 20_000)

    ;(async () => {
      autoGenAttemptedRef.current[task.id] = true
      setSubmitError(null)
      setCommentErrorByTaskId((prev) => {
        const next = { ...prev }
        delete next[task.id]
        return next
      })
      setGeneratingTaskId(task.id)

      try {
        const res = await fetch("/api/generate-comment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            redditUrl: task.redditUrl,
            exampleComment: task.exampleComment,
          }),
          signal: controller.signal,
        })
        const data = (await res.json()) as { comment?: string; error?: string }
        if (!res.ok || !data.comment) {
          throw new Error(data.error || "Failed to generate comment")
        }
        setGeneratedCommentByTaskId((prev) => ({ ...prev, [task.id]: data.comment! }))
      } catch (e) {
        if (controller.signal.aborted && !didTimeout) return
        const msg = didTimeout
          ? "Comment generation timed out. Check your OpenAI key/network, then Retry."
          : e instanceof Error
          ? e.message
          : "Failed to generate comment"
        setCommentErrorByTaskId((prev) => ({ ...prev, [task.id]: msg }))
        setSubmitError(msg)
      } finally {
        setGeneratingTaskId((cur) => (cur === task.id ? null : cur))
      }
    })()

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [activeTaskComment, step.kind, activeTaskIndex])

  async function onSubmitAll() {
    setSubmitError(null)

    const missing = redditTasks.find((t) => !commentUrlByTaskId[t.id]?.trim())
    if (missing) {
      setSubmitError(`Missing Reddit comment URL for ${missing.title}.`)
      return
    }

    try {
      setIsSubmitting(true)
      const sid = submissionId
      if (!sid) throw new Error("Missing submissionId")

      const tasksPayload = redditTasks.map((t) => {
        return {
          taskId: t.id,
          generatedComment: generatedCommentByTaskId[t.id] ?? null,
          commentUrl: commentUrlByTaskId[t.id]?.trim() ?? "",
        }
      })

      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: sid,
          name: name.trim(),
          redditUsername: redditUsername.trim(),
          tasks: tasksPayload,
        }),
      })
      const data = (await res.json()) as { ok?: boolean; submissionId?: string; error?: string }
      if (!res.ok || !data.ok || !data.submissionId) {
        throw new Error(data.error || "Submission failed")
      }
      setStep({ kind: "done", submissionId: data.submissionId })
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Submission failed")
    } finally {
      setIsSubmitting(false)
    }
  }

  function goBack() {
    if (step.kind === "redditUsername") {
      setStep({ kind: "pickName" })
      return
    }
    if (step.kind === "task") {
      if (step.index === 0) {
        setStep({ kind: "redditUsername" })
      } else {
        setStep({ kind: "task", index: step.index - 1 })
      }
    }
  }

  function goNextFromName() {
    if (!canContinueFromName) return
    setStep({ kind: "redditUsername" })
  }

  function goNextFromReddit() {
    if (!canContinueFromReddit) return
    const sid = `${new Date().toISOString().replace(/[:.]/g, "-")}_${safeSegment(name)}_${safeSegment(redditUsername)}_${crypto.randomUUID()}`
    setSubmissionId(sid)
    setStep({ kind: "task", index: 0 })
  }

  function goNextTask() {
    if (step.kind !== "task") return
    const task = redditTasks[step.index]
    const commentUrl = commentUrlByTaskId[task.id]?.trim()
    if (!commentUrl) {
      setSubmitError("Enter the Reddit comment URL to continue.")
      return
    }
    try {
      const parsed = new URL(commentUrl)
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Invalid URL")
    } catch {
      setSubmitError("Enter a valid Reddit comment URL.")
      return
    }
    if (step.index === redditTasks.length - 1) {
      void onSubmitAll()
      return
    }
    setStep({ kind: "task", index: step.index + 1 })
  }

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(65%_55%_at_50%_0%,rgba(24,24,27,0.10),transparent_60%)]" />

      <header className="relative mx-auto w-full max-w-xl px-4 pt-6">
        <div className="rounded-2xl border border-zinc-200 bg-white/80 p-4 shadow-sm backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Task Submission</h1>
              <p className="mt-1 text-sm text-zinc-600">Choose your name, enter your Reddit username, then add Reddit comment URLs for all 15 tasks.</p>
            </div>
          </div>
          <div className="mt-4">
            <ProgressBar current={currentStepNumber} total={totalSteps} />
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-xl px-4 pb-16 pt-4">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          {step.kind === "pickName" && (
            <section className="fade-in-up">
              <h2 className="text-base font-semibold">1) Enter your name</h2>
              <p className="mt-1 text-sm text-zinc-600">Enter your name.</p>

              <label className="mt-4 block text-sm font-medium">Your name</label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10"
              />

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={goNextFromName}
                  disabled={!canContinueFromName}
                  className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue
                </button>
              </div>
            </section>
          )}

          {step.kind === "redditUsername" && (
            <section className="fade-in-up">
              <h2 className="text-base font-semibold">2) Enter Reddit username</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Example: <span className="font-mono">u/yourname</span> or <span className="font-mono">yourname</span>
              </p>

              <label className="mt-4 block text-sm font-medium">Reddit username</label>
              <input
                autoFocus
                value={redditUsername}
                onChange={(e) => setRedditUsername(e.target.value)}
                placeholder="your_reddit_username"
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10"
              />

              <div className="mt-6 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={goBack}
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={goNextFromReddit}
                  disabled={!canContinueFromReddit}
                  className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition enabled:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Start tasks
                </button>
              </div>
            </section>
          )}

          {step.kind === "task" && activeTask && (
            <section className="fade-in-up">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">
                    {activeTask.title}{" "}
                    <span className="text-zinc-500">
                      ({activeTaskIndex! + 1}/{redditTasks.length})
                    </span>
                  </h2>
                  <div className="mt-2 flex flex-col gap-2 text-sm">
                    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
                      <p className="text-xs font-semibold text-zinc-600">Reddit Post:</p>
                      <a
                        href={activeTask.redditUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 block break-all font-mono text-xs text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900"
                      >
                        {activeTask.redditUrl}
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">Paste the below comment on the Reddit post.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {generatingTaskId === activeTask.id && <span className="text-xs font-medium text-zinc-600">Generating…</span>}
                    {commentErrorByTaskId[activeTask.id] && !generatedCommentByTaskId[activeTask.id] && (
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => {
                          autoGenAttemptedRef.current[activeTask.id] = false
                          setGeneratedCommentByTaskId((prev) => {
                            const next = { ...prev }
                            delete next[activeTask.id]
                            return next
                          })
                          setCommentErrorByTaskId((prev) => {
                            const next = { ...prev }
                            delete next[activeTask.id]
                            return next
                          })
                        }}
                        className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Retry
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={!generatedCommentByTaskId[activeTask.id]}
                      onClick={async () => {
                        const text = generatedCommentByTaskId[activeTask.id]
                        if (!text) return
                        await navigator.clipboard.writeText(text)
                        setCopiedTaskId(activeTask.id)
                        if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current)
                        copiedTimerRef.current = window.setTimeout(() => {
                          setCopiedTaskId((cur) => (cur === activeTask.id ? null : cur))
                        }, 1500)
                      }}
                      className={
                        copiedTaskId === activeTask.id
                          ? "inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 transition disabled:cursor-not-allowed disabled:opacity-50"
                          : "inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                      }
                    >
                      {copiedTaskId === activeTask.id ? "Copied!" : "Copy"}
                    </button>
                  </div>
                </div>

                <textarea
                  value={generatedCommentByTaskId[activeTask.id] ?? ""}
                  onChange={(e) =>
                    setGeneratedCommentByTaskId((prev) => ({
                      ...prev,
                      [activeTask.id]: e.target.value,
                    }))
                  }
                  placeholder={generatingTaskId === activeTask.id ? "Generating a comment…" : "Generated comment will appear here…"}
                  disabled={generatingTaskId === activeTask.id && !generatedCommentByTaskId[activeTask.id]}
                  rows={4}
                  className="mt-3 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10"
                />
              </div>

              <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <label className="block text-sm font-semibold">Reddit comment URL</label>
                <input
                  value={commentUrlByTaskId[activeTask.id] ?? ""}
                  onChange={(e) => {
                    setSubmitError(null)
                    setCommentUrlByTaskId((prev) => ({ ...prev, [activeTask.id]: e.target.value }))
                  }}
                  placeholder="https://www.reddit.com/r/.../comments/.../..."
                  inputMode="url"
                  className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-zinc-900 focus:ring-4 focus:ring-zinc-900/10"
                />
              </div>

              {submitError && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{submitError}</div>}

              <div className="mt-6 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={goNextTask}
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {activeTaskIndex === redditTasks.length - 1 ? (isSubmitting ? "Submitting…" : "Submit") : "Next"}
                </button>
              </div>
            </section>
          )}

          {step.kind === "done" && (
            <section className="fade-in-up">
              <h2 className="text-base font-semibold">Submitted</h2>
              <p className="mt-1 text-sm text-zinc-600">Thanks! Your submission has been saved.</p>
              <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <p className="text-sm font-medium">Submission ID</p>
                <p className="mt-1 break-all font-mono text-xs text-zinc-700">{step.submissionId}</p>
              </div>
              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSubmitError(null)
                    setIsSubmitting(false)
                    setCommentUrlByTaskId({})
                    setGeneratedCommentByTaskId({})
                    setRedditUsername("")
                    setName("")
                    setSubmissionId(null)
                    setStep({ kind: "pickName" })
                  }}
                  className="inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-50"
                >
                  New submission
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
