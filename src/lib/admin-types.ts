import type { GeneratedPersonaComment } from "@/lib/personas"

export type AdminRedditTask = {
  id: string
  redditUrl: string
  postText: string
  taskType: AdminTaskType
  commentMode: "ai" | "custom" | "freeform"
  customComment: string
  taskCategory: "marketing" | "warmup"
  warmupDay: number | null
}

export type AdminTaskType =
  | "comment"
  | "upvote"
  | "join_subreddit"
  | "change_profile_picture"
  | "change_banner_image"
  | "change_profile_bio"
  | "verify_reddit_email"

export function isAdminTaskType(value: unknown): value is AdminTaskType {
  return (
    value === "comment" ||
    value === "upvote" ||
    value === "join_subreddit" ||
    value === "change_profile_picture" ||
    value === "change_banner_image" ||
    value === "change_profile_bio" ||
    value === "verify_reddit_email"
  )
}

export function taskTypeRequiresRedditUrl(taskType: string) {
  return taskType === "comment" || taskType === "upvote" || taskType === "join_subreddit"
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
