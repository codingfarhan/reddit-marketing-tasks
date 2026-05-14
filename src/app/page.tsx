export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 px-4 text-zinc-950">
      <section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Maintenance
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          We are updating this form
        </h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          Submissions are temporarily paused while we make backend changes. Please check back soon.
        </p>
      </section>
    </main>
  )
}
