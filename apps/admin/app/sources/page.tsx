'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

export default function SourcesPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['sources'], queryFn: () => api.sources.list() });

  const [form, setForm] = useState({
    slug: '',
    label: '',
    pluginId: 'hmac',
    signingSecret: '',
  });

  const create = useMutation({
    mutationFn: () => api.sources.create({ ...form, targetIds: [], pluginConfig: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sources'] });
      setForm({ slug: '', label: '', pluginId: 'hmac', signingSecret: '' });
    },
  });

  const remove = useMutation({
    mutationFn: (slug: string) => api.sources.remove(slug),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sources'] }),
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <Link href="/" className="text-xs text-[color:var(--color-muted-foreground)] hover:underline">
        ← Dashboard
      </Link>
      <h1 className="mt-2 text-3xl font-semibold">Sources</h1>

      <section className="mt-8 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-5">
        <h2 className="text-sm uppercase tracking-wider text-[color:var(--color-muted-foreground)]">
          Add a source
        </h2>
        <form
          className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input label="slug" value={form.slug} onChange={(v) => setForm((f) => ({ ...f, slug: v }))} />
          <Input label="label" value={form.label} onChange={(v) => setForm((f) => ({ ...f, label: v }))} />
          <Input
            label="plugin id"
            value={form.pluginId}
            onChange={(v) => setForm((f) => ({ ...f, pluginId: v }))}
            placeholder="hmac / stripe / github / slack / shopify"
          />
          <Input
            label="signing secret"
            value={form.signingSecret}
            onChange={(v) => setForm((f) => ({ ...f, signingSecret: v }))}
            type="password"
          />
          <div className="sm:col-span-2">
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
          {list.data?.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-4"
            >
              <div>
                <div className="font-medium">
                  {s.label}{' '}
                  <code className="text-xs text-[color:var(--color-muted-foreground)]">/{s.slug}</code>
                </div>
                <div className="mt-1 text-xs text-[color:var(--color-muted-foreground)]">
                  plugin <code>{s.pluginId}</code> · {s.targetIds.length} target(s) ·{' '}
                  {s.enabled ? 'enabled' : 'disabled'}
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={() => remove.mutate(s.slug)}>
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

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="block text-xs text-[color:var(--color-muted-foreground)]">{label}</span>
      <input
        className="mt-1 w-full rounded-md border border-[color:var(--color-border)] bg-black/20 px-3 py-2 outline-none focus:border-[color:var(--color-accent)]"
        value={value}
        type={type}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
