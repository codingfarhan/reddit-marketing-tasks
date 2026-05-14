import { put } from "@vercel/blob";
import { redditTasks } from "@/lib/tasks";

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

type Body = {
  submissionId?: string;
  name?: string;
  redditUsername?: string;
  tasks?: Array<{
    taskId?: string;
    generatedComment?: string | null;
    originalName?: string;
    blobUrl?: string;
    blobPathname?: string;
    size?: number;
    type?: string;
  }>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const submissionId = String(body.submissionId ?? "").trim();
    const name = String(body.name ?? "").trim();
    const redditUsername = String(body.redditUsername ?? "").trim();

    if (!submissionId)
      return Response.json({ error: "Missing submissionId" }, { status: 400 });
    if (!name) return Response.json({ error: "Missing name" }, { status: 400 });
    if (!redditUsername) {
      return Response.json({ error: "Missing redditUsername" }, { status: 400 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return Response.json(
        { error: "Missing BLOB_READ_WRITE_TOKEN on server" },
        { status: 500 },
      );
    }

    const now = new Date();
    const taskInputs = Array.isArray(body.tasks) ? body.tasks : [];
    const inputByTaskId = new Map(
      taskInputs.map((t) => [String(t.taskId ?? ""), t] as const),
    );

    const savedTasks: SavedTask[] = redditTasks.map((task) => {
      const input = inputByTaskId.get(task.id);
      const blobUrl = input?.blobUrl ? String(input.blobUrl) : null;
      const blobPathname = input?.blobPathname ? String(input.blobPathname) : null;
      const originalName = input?.originalName ? String(input.originalName) : task.id;
      const size = typeof input?.size === "number" ? input.size : 0;
      const type = input?.type ? String(input.type) : "image/*";
      const generatedComment =
        typeof input?.generatedComment === "string" && input.generatedComment.trim()
          ? input.generatedComment.trim()
          : null;

      return {
        taskId: task.id,
        redditUrl: task.redditUrl,
        exampleComment: task.exampleComment,
        generatedComment,
        originalName,
        storedPath: `screenshots/${task.id}.jpg`,
        blobUrl,
        blobPathname,
        size,
        type,
      };
    });

    const missing = savedTasks.find((t) => !t.blobUrl);
    if (missing) {
      return Response.json(
        { error: `Missing uploaded screenshot for ${missing.taskId}` },
        { status: 400 },
      );
    }

    const meta = {
      submissionId,
      submittedAt: now.toISOString(),
      name,
      redditUsername,
      tasks: savedTasks,
    };

    const metaJson = JSON.stringify(meta, null, 2);
    await put(`submissions/${submissionId}/meta.json`, metaJson, {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json",
    });

    return Response.json({ ok: true, submissionId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
