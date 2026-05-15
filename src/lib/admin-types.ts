import type { GeneratedPersonaComment } from "@/lib/personas"

export type AdminRedditTask = {
  id: string
  redditUrl: string
  postText: string
  commentMode: "ai" | "custom" | "freeform"
  customComment: string
}

export type GeneratedTaskComments = {
  taskId: string
  redditUrl: string
  comments: GeneratedPersonaComment[]
}

export type AdminConfig = {
  tasks: AdminRedditTask[]
  generatedTaskComments: GeneratedTaskComments[]
  updatedAt: string | null
  generatedAt: string | null
}

export function emptyAdminConfig(): AdminConfig {
  return {
    tasks: [],
    generatedTaskComments: [],
    updatedAt: null,
    generatedAt: null,
  }
}
