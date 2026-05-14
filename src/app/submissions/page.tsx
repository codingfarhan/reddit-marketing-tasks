import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { list } from "@vercel/blob";

export const runtime = "nodejs";

type MetaTask = {
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

type SubmissionMeta = {
  submissionId: string;
  submittedAt: string;
  name: string;
  redditUsername: string;
  tasks: MetaTask[];
};

async function readSubmissionMetas(): Promise<SubmissionMeta[]> {
  const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

  if (useBlob) {
    const metas: SubmissionMeta[] = [];
    let cursor: string | undefined = undefined;
    do {
      const listResult: Awaited<ReturnType<typeof list>> = await list({
        prefix: "submissions/",
        cursor,
        limit: 1000,
      });
      cursor = listResult.cursor ?? undefined;
      for (const blob of listResult.blobs) {
        if (!blob.pathname.endsWith("/meta.json")) continue;
        try {
          const res = await fetch(blob.url, { cache: "no-store" });
          const parsed = (await res.json()) as SubmissionMeta;
          if (!parsed?.submissionId || !parsed?.name || !parsed?.redditUsername) continue;
          metas.push(parsed);
        } catch {
          // ignore
        }
      }
      if (!listResult.hasMore) break;
    } while (true);

    metas.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
    return metas;
  }

  const submissionsRoot = path.join(process.cwd(), "storage", "submissions");

  const metas: SubmissionMeta[] = [];

  let entries: string[] = [];
  try {
    entries = await readdir(submissionsRoot);
  } catch {
    return [];
  }

  await Promise.all(
    entries.map(async (dir) => {
      try {
        const metaPath = path.join(submissionsRoot, dir, "meta.json");
        const raw = await readFile(metaPath, "utf8");
        const parsed = JSON.parse(raw) as SubmissionMeta;
        if (!parsed?.submissionId || !parsed?.name || !parsed?.redditUsername) return;
        metas.push(parsed);
      } catch {
        // ignore invalid/partial submissions
      }
    }),
  );

  metas.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  return metas;
}

export default async function SubmissionsPage() {
  const metas = await readSubmissionMetas();

  const rows = metas.flatMap((m) =>
    (m.tasks ?? []).map((t) => ({
      submissionId: m.submissionId,
      submittedAt: m.submittedAt,
      name: m.name,
      redditUsername: m.redditUsername,
      taskId: t.taskId,
      screenshotPath:
        t.blobUrl ??
        path.join("storage", "submissions", m.submissionId, t.storedPath),
    })),
  );

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950">
      <div className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h1 className="text-lg font-semibold tracking-tight">Submissions</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Dashboard for viewing saved submissions.
          </p>
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200 p-4">
            <div>
              <p className="text-sm font-semibold">Uploads</p>
              <p className="text-xs text-zinc-600">
                {metas.length} submission{metas.length === 1 ? "" : "s"} • {rows.length} screenshot
                {rows.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                <tr>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Reddit</th>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Screenshot Path</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200">
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-sm text-zinc-600" colSpan={5}>
                      No submissions found yet.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={`${r.submissionId}:${r.taskId}`} className="hover:bg-zinc-50/60">
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-zinc-600">
                        {new Date(r.submittedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-medium">{r.name}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.redditUsername}</td>
                      <td className="px-4 py-3 font-mono text-xs">{r.taskId}</td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-700 break-all">
                        {r.screenshotPath.startsWith("http") ? (
                          <a
                            className="underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900"
                            href={r.screenshotPath}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {r.screenshotPath}
                          </a>
                        ) : (
                          r.screenshotPath
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
