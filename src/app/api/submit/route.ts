import { redditTasks } from "@/lib/tasks";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

export const runtime = "nodejs";

type SavedTask = {
  taskId: string;
  redditUrl: string;
  exampleComment: string;
  generatedComment: string | null;
  originalName: string;
  storedPath: string;
  blobUrl: string | null;
  blobPathname: string | null;
  size: number;
  type: string;
};

function safeSegment(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function getExtensionFromFile(file: File) {
  const fromName = file.name?.split(".").pop();
  if (fromName && fromName.length <= 8) return `.${fromName}`;
  if (file.type === "image/png") return ".png";
  if (file.type === "image/jpeg") return ".jpg";
  if (file.type === "image/webp") return ".webp";
  return "";
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const name = String(formData.get("name") ?? "").trim();
    const redditUsername = String(formData.get("redditUsername") ?? "").trim();

    if (!name) return Response.json({ error: "Missing name" }, { status: 400 });
    if (!redditUsername) {
      return Response.json({ error: "Missing redditUsername" }, { status: 400 });
    }

    const now = new Date();
    const submissionId = `${now
      .toISOString()
      .replace(/[:.]/g, "-")}_${safeSegment(name)}_${safeSegment(
      redditUsername,
    )}`;

    const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

    const rootDir = path.join(process.cwd(), "storage", "submissions", submissionId);
    const shotsDir = path.join(rootDir, "screenshots");
    if (!useBlob) {
      await mkdir(shotsDir, { recursive: true });
    }

    const savedTasks: SavedTask[] = [];

    for (let i = 0; i < redditTasks.length; i++) {
      const task = redditTasks[i];
      const key = `screenshot_${task.id}`;
      const maybeFile = formData.get(key);
      const commentKey = `comment_${task.id}`;
      const generatedCommentRaw = formData.get(commentKey);
      const generatedComment =
        typeof generatedCommentRaw === "string" && generatedCommentRaw.trim().length > 0
          ? generatedCommentRaw.trim()
          : null;

      if (!maybeFile) {
        return Response.json(
          { error: `Missing screenshot for ${task.id}` },
          { status: 400 },
        );
      }

      if (!(maybeFile instanceof File)) {
        return Response.json(
          { error: `Invalid screenshot for ${task.id}` },
          { status: 400 },
        );
      }

      if (maybeFile.size <= 0) {
        return Response.json(
          { error: `Empty screenshot for ${task.id}` },
          { status: 400 },
        );
      }

      const maxBytes = 4 * 1024 * 1024;
      if (maybeFile.size > maxBytes) {
        return Response.json(
          { error: `Screenshot too large for ${task.id} (max 4MB)` },
          { status: 400 },
        );
      }

      if (!maybeFile.type.startsWith("image/")) {
        return Response.json(
          { error: `Screenshot must be an image for ${task.id}` },
          { status: 400 },
        );
      }

      const ext = getExtensionFromFile(maybeFile);
      const filename = `${String(i + 1).padStart(2, "0")}_${task.id}${ext}`;
      const storedPath = path.join("screenshots", filename);
      const buffer = Buffer.from(await maybeFile.arrayBuffer());

      let blobUrl: string | null = null;
      let blobPathname: string | null = null;

      if (useBlob) {
        const pathnameInBlob = `submissions/${submissionId}/screenshots/${filename}`;
        const uploaded = await put(pathnameInBlob, buffer, {
          access: "public",
          addRandomSuffix: false,
          contentType: maybeFile.type || undefined,
        });
        blobUrl = uploaded.url;
        blobPathname = uploaded.pathname;
      } else {
        const absPath = path.join(rootDir, storedPath);
        await writeFile(absPath, buffer);
      }

      savedTasks.push({
        taskId: task.id,
        redditUrl: task.redditUrl,
        exampleComment: task.exampleComment,
        generatedComment,
        originalName: maybeFile.name || filename,
        storedPath,
        blobUrl,
        blobPathname,
        size: maybeFile.size,
        type: maybeFile.type,
      });
    }

    const meta = {
      submissionId,
      submittedAt: now.toISOString(),
      name,
      redditUsername,
      tasks: savedTasks,
    };

    const metaJson = JSON.stringify(meta, null, 2);
    if (useBlob) {
      await put(`submissions/${submissionId}/meta.json`, metaJson, {
        access: "public",
        addRandomSuffix: false,
        contentType: "application/json",
      });
    } else {
      await writeFile(path.join(rootDir, "meta.json"), metaJson, {
        encoding: "utf8",
      });
    }

    return Response.json({ ok: true, submissionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
