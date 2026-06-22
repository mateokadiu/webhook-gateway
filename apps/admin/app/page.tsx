export default function DashboardPage() {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:5001';
  const sections = [
    { name: 'Events', path: '/events', blurb: 'Inbound webhooks, dedup, status' },
    { name: 'Deliveries', path: '/deliveries', blurb: 'Per-target attempts, retries, DLQ' },
    { name: 'Sources', path: '/sources', blurb: 'Configure upstreams + signature plugin' },
    { name: 'Targets', path: '/targets', blurb: 'Configure downstream URLs + retry policy' },
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-10">
        <p className="text-sm uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
          phase 0 · scaffold
        </p>
        <h1 className="mt-2 text-4xl font-semibold">webhook-gateway</h1>
        <p className="mt-3 max-w-2xl text-[color:var(--color-muted-foreground)]">
          Verify, persist, fan out, retry, replay. Self-hosted, MIT.
        </p>
      </header>

      <section className="space-y-4 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-6">
        <h2 className="text-lg font-medium">Backend</h2>
        <p className="text-sm text-[color:var(--color-muted-foreground)]">
          API base: <code className="rounded bg-black/30 px-1.5 py-0.5">{apiBase}</code>
        </p>
        <a
          className="inline-block rounded-md border border-[color:var(--color-border)] px-3 py-1.5 text-sm hover:bg-[color:var(--color-muted)]"
          href={`${apiBase}/api/health`}
          target="_blank"
          rel="noreferrer"
        >
          Health check →
        </a>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map((s) => (
          <div
            key={s.path}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-5"
          >
            <div className="text-sm uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
              {s.name}
            </div>
            <div className="mt-2 text-xs text-[color:var(--color-muted-foreground)]">{s.blurb}</div>
            <div className="mt-3 text-xs italic text-[color:var(--color-muted-foreground)]">
              UI lands in Phase 4
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
