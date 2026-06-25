'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getBearer } from '@/lib/auth';

export default function DashboardPage() {
  const [hasBearer, setHasBearer] = useState<boolean | null>(null);
  useEffect(() => setHasBearer(getBearer() !== null), []);

  if (hasBearer === false) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-3xl font-semibold">webhook-gateway</h1>
        <p className="mt-3 text-sm text-[color:var(--color-muted-foreground)]">
          This device isn&apos;t paired yet. Generate <code>ADMIN_BEARER</code> in the api&apos;s
          <code> .env</code>, then pair it here.
        </p>
        <Link
          href="/pair"
          className="mt-6 inline-flex h-9 items-center justify-center rounded-md bg-[color:var(--color-accent)] px-4 text-sm font-medium text-[color:var(--color-accent-foreground)] hover:opacity-90"
        >
          Pair this device →
        </Link>
      </main>
    );
  }

  const cards = [
    { name: 'Events', path: '/events', blurb: 'inbound webhooks, dedup, status' },
    { name: 'Sources', path: '/sources', blurb: 'upstreams + signature plugins' },
    { name: 'Targets', path: '/targets', blurb: 'downstream URLs + retry policy' },
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-sm uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
            dashboard
          </p>
          <h1 className="mt-2 text-4xl font-semibold">webhook-gateway</h1>
        </div>
        <Link
          href="/pair"
          className="inline-flex h-9 items-center rounded-md border border-[color:var(--color-border)] px-4 text-sm font-medium hover:bg-[color:var(--color-muted)]"
        >
          Unpair
        </Link>
      </header>

      <section className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.path}
            href={c.path}
            className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-5 transition-colors hover:border-[color:var(--color-accent)]"
          >
            <div className="text-sm uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
              {c.name}
            </div>
            <div className="mt-2 text-xs text-[color:var(--color-muted-foreground)]">{c.blurb}</div>
          </Link>
        ))}
      </section>
    </main>
  );
}
