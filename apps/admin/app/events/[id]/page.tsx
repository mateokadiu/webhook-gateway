'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { use } from 'react';
import { Button } from '@/components/ui/button';
import { api, type Delivery } from '@/lib/api';

const DELIVERY_STATUS_STYLES: Record<Delivery['status'], string> = {
  pending: 'text-sky-400',
  retrying: 'text-amber-400',
  ok: 'text-emerald-400',
  failed: 'text-rose-400',
  dead: 'text-rose-500 font-medium',
};

interface Props {
  params: Promise<{ id: string }>;
}

export default function EventDetailPage({ params }: Props) {
  const { id } = use(params);
  const qc = useQueryClient();

  const event = useQuery({
    queryKey: ['event', id],
    queryFn: () => api.events.get(id),
    refetchInterval: 5_000,
  });
  const deliveries = useQuery({
    queryKey: ['deliveries', id],
    queryFn: () => api.deliveries.list({ event_id: id }),
    refetchInterval: 5_000,
  });

  const replay = useMutation({
    mutationFn: () => api.events.replay(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['event', id] });
      qc.invalidateQueries({ queryKey: ['deliveries', id] });
    },
  });
  const retry = useMutation({
    mutationFn: (dId: string) => api.deliveries.retry(dId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deliveries', id] }),
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/events" className="text-xs text-[color:var(--color-muted-foreground)] hover:underline">
        ← Events
      </Link>

      {event.isLoading && <p className="mt-4 text-sm">Loading…</p>}
      {event.error && <p className="mt-4 text-sm text-rose-400">{(event.error as Error).message}</p>}

      {event.data && (
        <>
          <header className="mt-2 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold">
                {event.data.topic ?? <span className="italic">no topic</span>}
              </h1>
              <p className="mt-1 font-mono text-xs text-[color:var(--color-muted-foreground)]">
                {event.data.id}
              </p>
              <p className="mt-3 text-sm">
                Status: <span className="font-medium">{event.data.status}</span> ·{' '}
                {event.data.fanOutOk}/{event.data.fanOut} delivered
                {event.data.fanOutFailed > 0 && (
                  <span className="text-rose-400"> · {event.data.fanOutFailed} failed</span>
                )}
              </p>
            </div>
            <Button variant="outline" onClick={() => replay.mutate()} disabled={replay.isPending}>
              {replay.isPending ? 'Replaying…' : 'Replay'}
            </Button>
          </header>

          <section className="mt-8">
            <h2 className="text-sm uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
              Body (first 4KB)
            </h2>
            <pre className="mt-2 max-h-80 overflow-auto rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4 text-xs">
              {event.data.bodyPreview || '(empty)'}
            </pre>
          </section>

          <section className="mt-8">
            <h2 className="text-sm uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
              Deliveries
            </h2>
            <ul className="mt-3 space-y-2">
              {deliveries.data?.map((d) => (
                <li
                  key={d.id}
                  className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={DELIVERY_STATUS_STYLES[d.status]}>
                        {d.status} · attempt {d.attempt}
                      </div>
                      <div className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                        target <code>{d.targetId.slice(0, 8)}</code>
                        {d.lastStatusCode !== null && ` · HTTP ${d.lastStatusCode}`}
                        {d.totalDurationMs !== null && ` · ${d.totalDurationMs}ms total`}
                      </div>
                    </div>
                    {d.status !== 'ok' && (
                      <Button size="sm" variant="outline" onClick={() => retry.mutate(d.id)}>
                        Retry
                      </Button>
                    )}
                  </div>
                  {d.lastResponseExcerpt && (
                    <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/30 p-2 text-xs">
                      {d.lastResponseExcerpt}
                    </pre>
                  )}
                </li>
              ))}
              {deliveries.data && deliveries.data.length === 0 && (
                <li className="text-sm text-[color:var(--color-muted-foreground)]">
                  no deliveries (no targets attached, or source has zero target_ids)
                </li>
              )}
            </ul>
          </section>
        </>
      )}
    </main>
  );
}
