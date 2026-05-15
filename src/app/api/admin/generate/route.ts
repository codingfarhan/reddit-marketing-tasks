import OpenAI from "openai"
import type { AdminRedditTask, GeneratedTaskComments } from "@/lib/admin-types"
import { readAdminConfig, writeAdminConfig } from "@/lib/admin-storage"
import { commentPersonas, type GeneratedPersonaComment } from "@/lib/personas"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300
const GENERATION_CONCURRENCY = 3
const MAX_COMMENT_LENGTH = 350
const COMMENT_RESPONSE_FORMAT = {
  type: "json_schema",
  name: "persona_comments",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      comments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            personaId: { type: "string" },
            name: { type: "string" },
            comment: { type: "string" },
          },
          required: ["personaId", "name", "comment"],
        },
      },
    },
    required: ["comments"],
  },
} as const

function validateTask(task: AdminRedditTask) {
  if (!task.redditUrl.trim()) return false
  if (task.commentMode === "custom") return Boolean(task.customComment.trim())
  if (!task.postText.trim()) return false

  try {
    const parsed = new URL(task.redditUrl)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

function extractJsonArray(text: string) {
  const trimmed = text.trim()
  if (trimmed.startsWith("[")) return trimmed
  const start = trimmed.indexOf("[")
  const end = trimmed.lastIndexOf("]")
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)
  return trimmed
}

function parseGeneratedComments(output: string) {
  const parsed = JSON.parse(output) as unknown
  if (Array.isArray(parsed)) return parsed as GeneratedPersonaComment[]
  if (parsed && typeof parsed === "object" && "comments" in parsed && Array.isArray((parsed as { comments?: unknown }).comments)) {
    return (parsed as { comments: GeneratedPersonaComment[] }).comments
  }

  return JSON.parse(extractJsonArray(output)) as GeneratedPersonaComment[]
}

function normalizeGeneratedComment(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/—/g, ", ")
    .replace(/\bquietly\b|\bsilently\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (normalized.length <= MAX_COMMENT_LENGTH) return normalized
  return normalized.slice(0, MAX_COMMENT_LENGTH).trimEnd()
}

function buildPersonaBrief(personas = commentPersonas) {
  return personas.map((persona) => ({
    id: persona.id,
    name: persona.name,
    archetype: persona.archetype,
    responsePattern: persona.responsePattern,
    tone: persona.tone,
    formality: persona.formality,
    commentLength: persona.commentLength,
    humorLevel: persona.humorLevel,
    agreeability: persona.agreeability,
    confidenceLevel: persona.confidenceLevel,
    emotionalWarmth: persona.emotionalWarmth,
    expertiseSignaling: persona.expertiseSignaling,
    curiosityLevel: persona.curiosityLevel,
    directness: persona.directness,
    supportiveness: persona.supportiveness,
    originality: persona.originality,
    socialEnergy: persona.socialEnergy,
    riskTolerance: persona.riskTolerance,
    engagementStyle: persona.engagementStyle,
    avoidPatterns: persona.avoidPatterns,
    favoriteMoves: persona.favoriteMoves,
  }))
}

function generationSystemPrompt() {
  return "You generate realistic Reddit comments for distinct personas. Output strict JSON only. No markdown. Use casual american english only. Avoid stiff, heavy, or corporate words that people rarely use in real conversations, such as cautious, leverage, robust, utilize, optimize, comprehensive, strategic, framework, synergy, streamline, transformative, quietly, or silently. Keep every generated comment lowercase only. Keep every generated comment at 350 characters or less. Keep comments casual, human, and straight to the point. Do not use idioms, metaphors, analogies, figures of speech, or phrases like move the needle, low hanging fruit, game changer, silver bullet, no-brainer, secret sauce, on the same page, or hit the ground running. Never use contrastive negation. Avoid patterns like not x but y, not just x but y, not only x but y, not about x it is about y, do not x instead y, and no x just y. Randomly and sparingly add casual words like hmm, lol, lmao, or idk only where they naturally fit. Do not force them into every comment. Every comment must start with a concrete solution to the OP's problem that is not related to feedvector dot com. This first solution can use free tools, manual tactics, or general strategy. Only after that, add another thing they should do that matches a relevant feedvector feature, then mention feedvector dot com plus one or two similar options chosen from hootsuite, hypefury, and feedhive. Vary those alternatives across comments instead of always using the same pair. Sometimes also mention a relevant non-social tool when it fits the first solution, such as google trends, google sheets, notion, canva, or chatgpt. When relevant, you may mention that feedvector dot com combines parts of canva, hootsuite, and chatgpt, so it can save money versus paying for several separate subscriptions. Whenever feedvector dot com is mentioned, always mention one or two similar options in the same comment. Use punctuation sparingly. Never mention AI. Never include raw URLs or domain-style links. If a website must be mentioned, write it in spoken form, for example feedvector dot com instead of feedvector.com."
}

function generationInstruction() {
  return "For the Reddit post, generate one meaningfully different comment per persona. You must return exactly one object for every persona provided. Do not skip any persona. Do not repeat the same opening phrase, tone, structure, advice, or point of view. Return a JSON array of objects with personaId, name, comment. Every comment must use casual american english, lowercase only, straight to the point, and no more than 350 characters. Avoid stiff words like cautious, leverage, robust, utilize, optimize, comprehensive, strategic, framework, synergy, streamline, transformative, quietly, or silently. Do not use idioms, metaphors, analogies, figures of speech, or phrases like move the needle, low hanging fruit, game changer, silver bullet, no-brainer, secret sauce, on the same page, or hit the ground running. Never use contrastive negation. Avoid patterns like not x but y, not just x but y, not only x but y, not about x it is about y, do not x instead y, and no x just y. Randomly and sparingly add casual words like hmm, lol, lmao, or idk only where they naturally fit. Do not use them in every comment. The first sentence must give a useful solution that is not feedvector-related at all. It can mention free tools like google trends only if relevant. After that, say another thing they should do using a relevant capability feedvector has, then mention feedvector dot com plus one or two similar options chosen from hootsuite, hypefury, and feedhive. Mix up the alternatives across comments and do not always use two examples or the same pair. When it fits the first solution, sometimes mention useful non-social tools like google trends, google sheets, notion, canva, or chatgpt too. When relevant, you may say feedvector dot com combines parts of canva, hootsuite, and chatgpt, which can save money compared with paying for several separate subscriptions. If you mention feedvector dot com, always mention one or two similar options in the same comment. Relevant feedvector features include scheduling posts across multiple social accounts, content calendar, social analytics, ai image and video generation, viral linkedin and x templates, canva-like design, team approval workflow, and mcp server for ai agents. Mention only relevant features. Never include raw URLs or domain-style links. If a website must be mentioned, write it in spoken form, for example feedvector dot com instead of feedvector.com. Comments should be 80 to 350 characters unless the persona is minimalist or funny_observer."
}

async function requestPersonaComments(client: OpenAI, task: AdminRedditTask, personas = commentPersonas) {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const resp = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        text: {
          format: COMMENT_RESPONSE_FORMAT,
        },
        input: [
          {
            role: "system",
            content: generationSystemPrompt(),
          },
          {
            role: "user",
            content: JSON.stringify({
              instruction: generationInstruction(),
              redditUrl: task.redditUrl,
              redditPostText: task.postText,
              personas: buildPersonaBrief(personas),
              requiredPersonaIds: personas.map((persona) => persona.id),
            }),
          },
        ],
      })

      const output = resp.output_text?.trim()
      if (!output) throw new Error(`No comments generated for ${task.id}`)

      return parseGeneratedComments(output)
    } catch (err) {
      lastError = err
    }
  }

  const message = lastError instanceof Error ? lastError.message : "Unknown JSON parse error"
  throw new Error(`Could not parse generated comments for ${task.id}: ${message}`)
}

async function generateForTask(client: OpenAI, task: AdminRedditTask): Promise<GeneratedTaskComments> {
  if (task.commentMode === "custom") {
    const comment = normalizeGeneratedComment(task.customComment)
    return {
      taskId: task.id,
      redditUrl: task.redditUrl,
      comments: commentPersonas.map((persona) => ({
        personaId: persona.id,
        name: persona.name,
        comment,
      })),
    }
  }

  const parsed = await requestPersonaComments(client, task)
  const retryPersonas = commentPersonas.filter((persona) => {
    const generated = parsed.find((comment) => comment.personaId === persona.id)
    return !normalizeGeneratedComment(String(generated?.comment ?? ""))
  })
  const retryParsed = retryPersonas.length > 0 ? await requestPersonaComments(client, task, retryPersonas) : []
  const allParsed = [...parsed, ...retryParsed]
  const comments = commentPersonas.map((persona) => {
    const generated = allParsed.find((comment) => comment.personaId === persona.id)
    return {
      personaId: persona.id,
      name: persona.name,
      comment: normalizeGeneratedComment(String(generated?.comment ?? "")),
    }
  })

  const missing = comments.find((comment) => !comment.comment)
  if (missing) throw new Error(`Missing generated comment for ${missing.name} on ${task.id}`)

  return {
    taskId: task.id,
    redditUrl: task.redditUrl,
    comments,
  }
}

export async function POST() {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) return Response.json({ error: "Missing OPENAI_API_KEY on server" }, { status: 500 })

    const config = await readAdminConfig()
    const tasks = config.tasks
    if (tasks.length === 0 || tasks.some((task) => !validateTask(task))) {
      return Response.json({ error: "Add at least one task with a valid Reddit URL and post text before generating." }, { status: 400 })
    }

    const client = new OpenAI({
      apiKey,
      timeout: 120_000,
      maxRetries: 1,
    })

    const generatedTaskComments: GeneratedTaskComments[] = []
    for (let index = 0; index < tasks.length; index += GENERATION_CONCURRENCY) {
      const chunk = tasks.slice(index, index + GENERATION_CONCURRENCY)
      generatedTaskComments.push(...(await Promise.all(chunk.map((task) => generateForTask(client, task)))))
    }

    const updated = {
      ...config,
      tasks,
      generatedTaskComments,
      generatedAt: new Date().toISOString(),
    }
    await writeAdminConfig(updated)

    return Response.json({
      ok: true,
      generatedAt: updated.generatedAt,
      generatedTaskComments,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    const status = typeof err === "object" && err !== null && "status" in err && typeof err.status === "number" ? err.status : 500
    return Response.json({ error: message }, { status })
  }
}
