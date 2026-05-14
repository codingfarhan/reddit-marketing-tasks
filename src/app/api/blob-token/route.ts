import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Body = {
  pathname?: string
  contentType?: string
}

function isAllowedPathname(pathname: string) {
  return pathname.startsWith("submissions/") && !pathname.includes("..")
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body
    const pathname = String(body.pathname ?? "").trim()
    const contentType = String(body.contentType ?? "").trim()
    console.info("[blob-token] request", { pathname, contentType })
    if (!pathname) return Response.json({ error: "Missing pathname" }, { status: 400 })
    if (!isAllowedPathname(pathname)) return Response.json({ error: "Invalid pathname" }, { status: 400 })

    const allowedContentTypes = [
      "image/*",
      "application/pdf",
      "text/plain",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ]

    if (contentType && !allowedContentTypes.some((t) => (t.endsWith("/*") ? contentType.startsWith(t.slice(0, -1)) : t === contentType))) {
      return Response.json({ error: "Unsupported contentType" }, { status: 400 })
    }

    const tokenOptions = {
      pathname,
      addRandomSuffix: false,
      allowOverwrite: true,
      maximumSizeInBytes: 25 * 1024 * 1024,
      allowedContentTypes: contentType ? [contentType] : undefined,
      validUntil: Date.now() + 360000,
    }

    console.info("[blob-token] generating token", {
      pathname: tokenOptions.pathname,
      allowedContentTypes: tokenOptions.allowedContentTypes,
      maximumSizeInBytes: tokenOptions.maximumSizeInBytes,
      allowOverwrite: tokenOptions.allowOverwrite,
      validUntil: tokenOptions.validUntil,
    })

    const token = await generateClientTokenFromReadWriteToken(tokenOptions)

    console.info("[blob-token] generated token", {
      pathname,
      contentType,
      tokenPrefix: token.slice(0, 30),
    })

    return Response.json({ token }, { headers: { "Cache-Control": "no-store, max-age=0" } })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    const status = typeof err === "object" && err !== null && "status" in err && typeof err.status === "number" ? err.status : 500
    console.error("[blob-token] failed", { status, message, err })
    return Response.json({ error: message }, { status })
  }
}
