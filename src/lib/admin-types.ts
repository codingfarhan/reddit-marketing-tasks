import type { GeneratedPersonaComment } from "@/lib/personas"

export type AdminRedditTask = {
  id: string
  redditUrl: string
  postText: string
  taskType: "comment" | "upvote" | "join_subreddit"
  commentMode: "ai" | "custom" | "freeform"
  customComment: string
  taskCategory: "marketing" | "warmup"
  warmupDay: number | null
}

export type PersonaSetting = {
  personaId: string
  status: "marketing" | "warmup"
  warmupStartDate: string
}

export type GeneratedTaskComments = {
  taskId: string
  redditUrl: string
  comments: GeneratedPersonaComment[]
}

export type AdminConfig = {
  tasks: AdminRedditTask[]
  warmupTasks: AdminRedditTask[][]
  personaSettings: PersonaSetting[]
  generatedTaskComments: GeneratedTaskComments[]
  updatedAt: string | null
  generatedAt: string | null
}

export function emptyAdminConfig(): AdminConfig {
  return {
    tasks: [],
    warmupTasks: Array.from({ length: 7 }, () => []),
    personaSettings: [],
    generatedTaskComments: [],
    updatedAt: null,
    generatedAt: null,
  }
}
