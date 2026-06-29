'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { api, type EventRow } from '@/lib/api';

const STATUS_STYLES: Record<EventRow['status'], string> = {
  queued: 'text-sky-400',
  processing: 'text-amber-400',
  ok: 'text-emerald-400',
  partial: 'text-amber-400',
  failed: 'text-rose-400',
  tombstoned: 'text-[color:var(--color-muted-foreground)]',
};

export default function EventsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const { data, error, isLoading } = useQuery({
    queryKey: ['events', statusFilter, searchTerm],
    queryFn: () =>
      api.events.list({
        status: statusFilter || undefined,
        q: searchTerm || undefined,
        limit: 200,
      }),
    refetchInterval: 5_000,
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <Link href="/" className="text-xs text-[color:var(--color-muted-foreground)] hover:underline">
        ← Dashboard
      </Link>
      <h1 className="mt-2 text-3xl font-semibold">Events</h1>

      <div className="mt-6 flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-3 py-2 text-sm"
        >
          <option value="">all statuses</option>
          {(['queued', 'processing', 'ok', 'partial', 'failed', 'tombstoned'] as const).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSearchTerm(searchInput.trim());
          }}
        >
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="search topic / dedup / body…"
            className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-3 py-2 text-sm"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchInput('');
                setSearchTerm('');
              }}
              className="rounded-md border border-[color:var(--color-border)] px-3 py-2 text-xs text-[color:var(--color-muted-foreground)] hover:bg-[color:var(--color-card)]"
            >
              clear
            </button>
          )}
          <button
            type="submit"
            className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-3 py-2 text-xs hover:bg-[color:var(--color-muted)]"
          >
            search
          </button>
        </form>
      </div>

      {isLoading && <p className="mt-8 text-sm">Loading…</p>}
      {error && <p className="mt-8 text-sm text-rose-400">{(error as Error).message}</p>}

      <div className="mt-8 overflow-hidden rounded-lg border border-[color:var(--color-border)]">
        <table className="w-full text-sm">
          <thead className="bg-[color:var(--color-card)] text-left text-xs uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
            <tr>
              <th className="px-4 py-3">id</th>
              <th className="px-4 py-3">topic</th>
              <th className="px-4 py-3">status</th>
              <th className="px-4 py-3">fan-out</th>
              <th className="px-4 py-3">size</th>
              <th className="px-4 py-3">received</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((e) => (
              <tr key={e.id} className="border-t border-[color:var(--color-border)]">
                <td className="px-4 py-3 font-mono">
                  <Link href={`/events/${e.id}`} className="hover:underline">
                    {e.id.slice(0, 8)}…
                  </Link>
                </td>
                <td className="px-4 py-3">{e.topic ?? '—'}</td>
                <td className={`px-4 py-3 ${STATUS_STYLES[e.status]}`}>{e.status}</td>
                <td className="px-4 py-3">
                  {e.fanOutOk}/{e.fanOut}
                  {e.fanOutFailed > 0 && (
                    <span className="text-rose-400"> · {e.fanOutFailed} failed</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-[color:var(--color-muted-foreground)]">
                  {e.sizeBytes} B
                </td>
                <td className="px-4 py-3 text-xs text-[color:var(--color-muted-foreground)]">
                  {new Date(e.receivedAt).toLocaleString()}
                </td>
              </tr>
            ))}
            {data && data.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-[color:var(--color-muted-foreground)]"
                >
                  No events
                  {searchTerm ? ` matching "${searchTerm}"` : ''}
                  {statusFilter ? ` with status=${statusFilter}` : !searchTerm ? ' yet' : ''}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
