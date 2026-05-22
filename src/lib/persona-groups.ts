import type { AdminRedditTask, PersonaSetting } from "@/lib/admin-types"
import { commentPersonas } from "@/lib/personas"

export type PersonaGroup = "group_1" | "group_2"

const MARKETING_PERSONA_COUNT = 15
const FIRST_MARKETING_GROUP_SIZE = 7
const ALL_TASKS_READY_PERSONA_LIMIT = 6
const marketingPersonas = commentPersonas.slice(0, MARKETING_PERSONA_COUNT)

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
  return marketingPersonas.filter((persona) => {
    const setting = personaSettings.find((item) => item.personaId === persona.id)
    return setting?.status !== "warmup"
  })
}

export function shouldGiveAllMarketingTasks(personaSettings: PersonaSetting[] = []) {
  const readyPersonas = getReadyMarketingPersonas(personaSettings)
  return readyPersonas.length > 0 && readyPersonas.length <= ALL_TASKS_READY_PERSONA_LIMIT
}

export function getPersonaGroup(personaId: string, personaSettings: PersonaSetting[] = []): PersonaGroup | null {
  const readyPersonas = getReadyMarketingPersonas(personaSettings)
  const index = readyPersonas.findIndex((persona) => persona.id === personaId)
  if (index < 0) return null
  return index < FIRST_MARKETING_GROUP_SIZE ? "group_1" : "group_2"
}

export function getPersonasForGroup(group: PersonaGroup, personaSettings: PersonaSetting[] = []) {
  const readyPersonas = getReadyMarketingPersonas(personaSettings)
  return group === "group_1" ? readyPersonas.slice(0, FIRST_MARKETING_GROUP_SIZE) : readyPersonas.slice(FIRST_MARKETING_GROUP_SIZE)
}

export function getTaskGroup(taskIndex: number, taskCount: number): PersonaGroup {
  const firstGroupTaskCount = Math.min(FIRST_MARKETING_GROUP_SIZE, taskCount)
  return taskIndex < firstGroupTaskCount ? "group_1" : "group_2"
}

export function getTasksForPersona(tasks: AdminRedditTask[], personaId: string, personaSettings: PersonaSetting[] = []) {
  const readyPersonas = getReadyMarketingPersonas(personaSettings)
  if (!readyPersonas.some((persona) => persona.id === personaId)) return []
  const shuffledTasks = getShuffledMarketingTasks(tasks)
  if (shouldGiveAllMarketingTasks(personaSettings)) return shuffledTasks
  const group = getPersonaGroup(personaId, personaSettings)
  if (!group) return []
  return shuffledTasks.filter((_, index) => getTaskGroup(index, shuffledTasks.length) === group)
}
