import path from "node:path"

export function getSubmissionsFilePath() {
  if (process.env.VERCEL) {
    return path.join("/tmp", "reddit-marketing-tasks", "submissions.json")
  }

  return path.join(process.cwd(), "storage", "submissions.json")
}

export function getSubmissionsFileLabel() {
  if (process.env.VERCEL) {
    return "/tmp/reddit-marketing-tasks/submissions.json"
  }

  return "storage/submissions.json"
}
