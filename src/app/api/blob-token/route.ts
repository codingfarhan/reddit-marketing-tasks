import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

export const runtime = "nodejs";

type Body = {
  pathname?: string;
  contentType?: string;
};

function isAllowedPathname(pathname: string) {
  return pathname.startsWith("submissions/") && !pathname.includes("..");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const pathname = String(body.pathname ?? "").trim();
    const contentType = String(body.contentType ?? "").trim();
    if (!pathname) return Response.json({ error: "Missing pathname" }, { status: 400 });
    if (!isAllowedPathname(pathname))
      return Response.json({ error: "Invalid pathname" }, { status: 400 });

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
    ];

    if (contentType && !allowedContentTypes.some((t) => (t.endsWith("/*") ? contentType.startsWith(t.slice(0, -1)) : t === contentType))) {
      return Response.json({ error: "Unsupported contentType" }, { status: 400 });
    }

    const token = await generateClientTokenFromReadWriteToken({
      pathname,
      addRandomSuffix: false,
      allowOverwrite: true,
      maximumSizeInBytes: 25 * 1024 * 1024,
      allowedContentTypes: [...allowedContentTypes, "application/json"],
    });

    return Response.json({ token });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status =
      typeof err === "object" && err !== null && "status" in err && typeof err.status === "number"
        ? err.status
        : 500;
    return Response.json({ error: message }, { status });
  }
}
