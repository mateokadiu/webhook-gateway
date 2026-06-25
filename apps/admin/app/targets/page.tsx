'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

export default function TargetsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['targets'], queryFn: () => api.targets.list() });

  const [form, setForm] = useState({ label: '', url: '', signingSecret: '' });

  const create = useMutation({
    mutationFn: () =>
      api.targets.create({
        label: form.label,
        url: form.url,
        signingSecret: form.signingSecret || null,
        headers: {},
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['targets'] });
      setForm({ label: '', url: '', signingSecret: '' });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.targets.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['targets'] }),
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/" className="text-xs text-[color:var(--color-muted-foreground)] hover:underline">
        ← Dashboard
      </Link>
      <h1 className="mt-2 text-3xl font-semibold">Targets</h1>

      <section className="mt-8 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-5">
        <h2 className="text-sm uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
          Add a target
        </h2>
        <form
          className="mt-4 grid grid-cols-1 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Field label="label">
            <input
              className="w-full rounded-md border border-[color:var(--color-border)] bg-black/20 px-3 py-2 text-sm"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            />
          </Field>
          <Field label="url (https://your-service/webhooks/in)">
            <input
              className="w-full rounded-md border border-[color:var(--color-border)] bg-black/20 px-3 py-2 text-sm"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            />
          </Field>
          <Field label="signing secret (optional — gateway re-signs outbound)">
            <input
              type="password"
              className="w-full rounded-md border border-[color:var(--color-border)] bg-black/20 px-3 py-2 text-sm"
              value={form.signingSecret}
              onChange={(e) => setForm((f) => ({ ...f, signingSecret: e.target.value }))}
            />
          </Field>
          <div>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
            {create.error && (
              <p className="ml-3 inline-block text-sm text-rose-400">
                {(create.error as Error).message}
              </p>
            )}
          </div>
        </form>
      </section>

      <section className="mt-8">
        <h2 className="text-sm uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
          Configured
        </h2>
        <ul className="mt-3 space-y-2">
          {list.data?.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4"
            >
              <div className="min-w-0">
                <div className="font-medium">{t.label}</div>
                <div className="mt-1 truncate text-xs text-[color:var(--color-muted-foreground)]">
                  {t.url}
                </div>
                <div className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                  max attempts {t.maxAttempts} · timeout {t.timeoutMs}ms ·{' '}
                  {t.signingSecret ? 'signed outbound' : 'unsigned'}
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={() => remove.mutate(t.id)}>
                Delete
              </Button>
            </li>
          ))}
          {list.data && list.data.length === 0 && (
            <li className="text-sm text-[color:var(--color-muted-foreground)]">none configured.</li>
          )}
        </ul>
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="block text-xs text-[color:var(--color-muted-foreground)]">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
