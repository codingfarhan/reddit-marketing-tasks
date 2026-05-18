import type { AdminRedditTask } from "@/lib/admin-types"
import { commentPersonas } from "@/lib/personas"

export type PersonaGroup = "group_1" | "group_2"

const firstGroupSize = Math.ceil(commentPersonas.length / 2)

export function getPersonaGroup(personaId: string): PersonaGroup | null {
  const index = commentPersonas.findIndex((persona) => persona.id === personaId)
  if (index < 0) return null
  return index < firstGroupSize ? "group_1" : "group_2"
}

export function getPersonasForGroup(group: PersonaGroup) {
  return group === "group_1" ? commentPersonas.slice(0, firstGroupSize) : commentPersonas.slice(firstGroupSize)
}

export function getTaskGroup(taskIndex: number, taskCount: number): PersonaGroup {
  return taskIndex < Math.ceil(taskCount / 2) ? "group_1" : "group_2"
}

export function getTasksForPersona(tasks: AdminRedditTask[], personaId: string) {
  const group = getPersonaGroup(personaId)
  if (!group) return []
  return tasks.filter((_, index) => getTaskGroup(index, tasks.length) === group)
}
