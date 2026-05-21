import type { AdminRedditTask } from "@/lib/admin-types"
import { commentPersonas } from "@/lib/personas"

export type PersonaGroup = "group_1" | "group_2"

const MARKETING_PERSONA_COUNT = 15
const FIRST_MARKETING_GROUP_SIZE = 7
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

export function getPersonaGroup(personaId: string): PersonaGroup | null {
  const index = marketingPersonas.findIndex((persona) => persona.id === personaId)
  if (index < 0) return null
  return index < FIRST_MARKETING_GROUP_SIZE ? "group_1" : "group_2"
}

export function getPersonasForGroup(group: PersonaGroup) {
  return group === "group_1" ? marketingPersonas.slice(0, FIRST_MARKETING_GROUP_SIZE) : marketingPersonas.slice(FIRST_MARKETING_GROUP_SIZE)
}

export function getTaskGroup(taskIndex: number, taskCount: number): PersonaGroup {
  const firstGroupTaskCount = Math.min(FIRST_MARKETING_GROUP_SIZE, taskCount)
  return taskIndex < firstGroupTaskCount ? "group_1" : "group_2"
}

export function getTasksForPersona(tasks: AdminRedditTask[], personaId: string) {
  const group = getPersonaGroup(personaId)
  if (!group) return []
  const shuffledTasks = getShuffledMarketingTasks(tasks)
  return shuffledTasks.filter((_, index) => getTaskGroup(index, shuffledTasks.length) === group)
}
