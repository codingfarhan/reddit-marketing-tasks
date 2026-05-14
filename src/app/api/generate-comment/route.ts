import OpenAI from "openai"

export const runtime = "nodejs"

type Body = {
  redditUrl?: string
  exampleComment?: string
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return Response.json({ error: "Missing OPENAI_API_KEY on server" }, { status: 500 })
    }

    const body = (await request.json()) as Body
    const redditUrl = String(body.redditUrl ?? "").trim()
    const exampleComment = String(body.exampleComment ?? "").trim()

    if (!redditUrl) return Response.json({ error: "Missing redditUrl" }, { status: 400 })
    if (!exampleComment) return Response.json({ error: "Missing exampleComment" }, { status: 400 })

    const client = new OpenAI({
      apiKey,
      timeout: 20_000,
      maxRetries: 0,
    })

    const input = [
      {
        role: "system" as const,
        content:
          "You write authentic, original sounding and helpful Reddit comments without em dashes and keeping it very straight to the point. Do not use formal tone. Always write in small caps and avoid using many punctuation marks other than full stops. Do not mention AI or that you were generated. Avoid spammy promotion. Output only the comment text.",
      },
      {
        role: "user" as const,
        content: `Reddit URL:\n${redditUrl}\n\nExample comment (use as style and intent, but write a NEW unique comment):\n${exampleComment}\n\nWrite one new comment now. Max 300 characters.`,
      },
    ]

    const resp = await client.responses.create({
      model: "gpt-5.2",
      input,
    })

    const comment = resp.output_text?.trim()
    if (!comment) {
      return Response.json({ error: "No comment generated" }, { status: 500 })
    }

    return Response.json({ comment })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    const status = typeof err === "object" && err !== null && "status" in err && typeof err.status === "number" ? err.status : 500
    return Response.json({ error: message }, { status })
  }
}
