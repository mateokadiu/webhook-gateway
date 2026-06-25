'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { clearBearer, getBearer, setBearer } from '@/lib/auth';

export default function PairPage() {
  const [token, setToken] = useState('');
  const [paired, setPaired] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => setPaired(getBearer()), []);

  const handleSave = () => {
    if (!token.trim()) return;
    setBearer(token.trim());
    router.push('/');
  };

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Pair this device</h1>
      <p className="mt-3 text-sm text-[color:var(--color-muted-foreground)]">
        Paste the <code>ADMIN_BEARER</code> from the api&apos;s <code>.env</code>. Stored in
        localStorage on this device only.
      </p>

      {paired ? (
        <div className="mt-8 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] p-5">
          <p className="text-sm">
            Paired. Token starts with <code>{paired.slice(0, 8)}…</code>
          </p>
          <div className="mt-4 flex gap-3">
            <Button variant="outline" onClick={() => router.push('/')}>
              Back
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                clearBearer();
                setPaired(null);
                setToken('');
              }}
            >
              Unpair
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
        >
          <label className="block text-sm font-medium">Bearer token</label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="paste ADMIN_BEARER"
            type="password"
            autoComplete="off"
            className="w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-card)] px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent)]"
          />
          <Button type="submit">Pair</Button>
        </form>
      )}
    </main>
  );
}
