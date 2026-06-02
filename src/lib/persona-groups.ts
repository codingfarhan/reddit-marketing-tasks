import type { AdminRedditTask, PersonaSetting } from "@/lib/admin-types"
import { commentPersonas, type CommentPersona } from "@/lib/personas"

export const MAX_PERSONAS_PER_MARKETING_TASK = 1

function stableHash(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0
  }
  return hash
}

export function getShuffledMarketingTasks(tasks: AdminRedditTask[]) {
  return [...tasks].sort((left, right) => {
    const leftHash = stableHash(left.id || left.redditUrl)
    const rightHash = stableHash(right.id || right.redditUrl)
    if (leftHash !== rightHash) return leftHash - rightHash
    return left.id.localeCompare(right.id)
  })
}

function normalizeSubreddit(value: string) {
  return value.trim().replace(/^r\//i, "").toLowerCase()
}

function getTaskSubreddit(task: AdminRedditTask) {
  const redditUrl = task.redditUrl.trim()
  if (!redditUrl) return null

  try {
    const parsed = new URL(redditUrl)
    const match = parsed.pathname.match(/\/r\/([^/?#]+)/i)
    return match?.[1] ? normalizeSubreddit(decodeURIComponent(match[1])) : null
  } catch {
    const match = redditUrl.match(/(?:^|\/)r\/([^/?#\s]+)/i)
    return match?.[1] ? normalizeSubreddit(match[1]) : null
  }
}

function isPersonaBannedFromTask(persona: CommentPersona, task: AdminRedditTask) {
  const subreddit = getTaskSubreddit(task)
  if (!subreddit) return false
  return (persona.bannedSubreddits ?? []).some((bannedSubreddit) => normalizeSubreddit(bannedSubreddit) === subreddit)
}

export function getReadyMarketingPersonas(personaSettings: PersonaSetting[] = []) {
  return commentPersonas.filter((persona) => {
    const setting = personaSettings.find((item) => item.personaId === persona.id)
    return setting?.status !== "warmup"
  })
}

export function getPersonasForMarketingTask(task: AdminRedditTask, taskIndex: number, personaSettings: PersonaSetting[] = []) {
  const readyPersonas = getReadyMarketingPersonas(personaSettings)
  const personaCount = Math.min(MAX_PERSONAS_PER_MARKETING_TASK, readyPersonas.length)
  if (taskIndex < 0 || personaCount === 0) return []
  const startIndex = (taskIndex * MAX_PERSONAS_PER_MARKETING_TASK) % readyPersonas.length
  const assignedPersonas: CommentPersona[] = []

  for (let offset = 0; offset < readyPersonas.length && assignedPersonas.length < personaCount; offset += 1) {
    const persona = readyPersonas[(startIndex + offset) % readyPersonas.length]
    if (!isPersonaBannedFromTask(persona, task)) assignedPersonas.push(persona)
  }

  return assignedPersonas
}

export function getTasksForPersona(tasks: AdminRedditTask[], personaId: string, personaSettings: PersonaSetting[] = []) {
  const readyPersonas = getReadyMarketingPersonas(personaSettings)
  if (!readyPersonas.some((persona) => persona.id === personaId)) return []
  const shuffledTasks = getShuffledMarketingTasks(tasks)
  return shuffledTasks.filter((task, index) => getPersonasForMarketingTask(task, index, personaSettings).some((persona) => persona.id === personaId))
}
