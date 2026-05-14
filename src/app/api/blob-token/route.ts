import { handleUpload, type HandleUploadBody } from "@vercel/blob/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function isAllowedPathname(pathname: string) {
  return pathname.startsWith("submissions/") && !pathname.includes("..")
}

function isAllowedContentType(contentType: string) {
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

  return allowedContentTypes.some((type) =>
    type.endsWith("/*") ? contentType.startsWith(type.slice(0, -1)) : type === contentType,
  )
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
        const contentType = String(clientPayload ?? "").trim()
        console.info("[blob-token] request", { pathname, contentType, multipart })

        if (!isAllowedPathname(pathname)) throw new Error("Invalid pathname")
        if (!contentType || !isAllowedContentType(contentType)) {
          throw new Error("Unsupported contentType")
        }

        const tokenOptions = {
          addRandomSuffix: false,
          allowOverwrite: true,
          maximumSizeInBytes: 25 * 1024 * 1024,
          allowedContentTypes: [contentType],
          validUntil: Date.now() + 60 * 60 * 1000,
        }

        console.info("[blob-token] generating token", {
          pathname,
          contentType,
          multipart,
          ...tokenOptions,
        })

        return tokenOptions
      },
    })

    return Response.json(jsonResponse, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    const status = typeof err === "object" && err !== null && "status" in err && typeof err.status === "number" ? err.status : 500
    console.error("[blob-token] failed", { status, message, err })
    return Response.json({ error: message }, { status })
  }
}
