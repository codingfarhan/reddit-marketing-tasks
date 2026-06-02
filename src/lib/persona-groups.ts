import type { AdminRedditTask, PersonaSetting } from "@/lib/admin-types"
import { commentPersonas } from "@/lib/personas"

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

export function getReadyMarketingPersonas(personaSettings: PersonaSetting[] = []) {
  return commentPersonas.filter((persona) => {
    const setting = personaSettings.find((item) => item.personaId === persona.id)
    return setting?.status !== "warmup"
  })
}

export function getPersonasForMarketingTask(taskIndex: number, personaSettings: PersonaSetting[] = []) {
  const readyPersonas = getReadyMarketingPersonas(personaSettings)
  const personaCount = Math.min(MAX_PERSONAS_PER_MARKETING_TASK, readyPersonas.length)
  if (taskIndex < 0 || personaCount === 0) return []
  const startIndex = (taskIndex * MAX_PERSONAS_PER_MARKETING_TASK) % readyPersonas.length
  return Array.from({ length: personaCount }, (_, offset) => readyPersonas[(startIndex + offset) % readyPersonas.length])
}

export function getTasksForPersona(tasks: AdminRedditTask[], personaId: string, personaSettings: PersonaSetting[] = []) {
  const readyPersonas = getReadyMarketingPersonas(personaSettings)
  if (!readyPersonas.some((persona) => persona.id === personaId)) return []
  const shuffledTasks = getShuffledMarketingTasks(tasks)
  return shuffledTasks.filter((_, index) => getPersonasForMarketingTask(index, personaSettings).some((persona) => persona.id === personaId))
}
