'use client';

import { getBearer } from './auth';

const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:5001';

export interface Source {
  id: string;
  slug: string;
  label: string;
  pluginId: string;
  signingSecret: string;
  signatureToleranceSec: number;
  pluginConfig: Record<string, string>;
  targetIds: string[];
  enabled: boolean;
  testMode: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Target {
  id: string;
  label: string;
  url: string;
  signingSecret: string | null;
  headers: Record<string, string>;
  timeoutMs: number;
  maxAttempts: number;
  backoffSchedule: number[];
  enabled: boolean;
}

export interface EventRow {
  id: string;
  sourceId: string;
  topic: string | null;
  dedupKey: string;
  bodyHash: string;
  sizeBytes: number;
  status: 'queued' | 'processing' | 'ok' | 'partial' | 'failed' | 'tombstoned';
  fanOut: number;
  fanOutOk: number;
  fanOutFailed: number;
  receivedAt: string;
  completedAt: string | null;
}

export interface EventDetail extends EventRow {
  headers: Record<string, string>;
  bodyPreview: string;
}

export interface Delivery {
  id: string;
  eventId: string;
  targetId: string;
  attempt: number;
  nextAttemptAt: string | null;
  status: 'pending' | 'retrying' | 'ok' | 'failed' | 'dead';
  lastStatusCode: number | null;
  lastResponseExcerpt: string | null;
  lastAttemptAt: string | null;
  totalDurationMs: number | null;
  createdAt: string;
  completedAt: string | null;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const bearer = getBearer();
  if (!bearer) throw new Error('not paired — set ADMIN_BEARER via /pair');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${bearer}`,
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: () => fetch(`${BASE}/api/health`).then((r) => r.json()),

  sources: {
    list: () => request<Source[]>('/api/sources'),
    create: (body: Partial<Source>) =>
      request<Source>('/api/sources', { method: 'POST', body: JSON.stringify(body) }),
    remove: (slug: string) =>
      request<{ ok: true }>(`/api/sources/${slug}`, { method: 'DELETE' }),
  },
  targets: {
    list: () => request<Target[]>('/api/targets'),
    create: (body: Partial<Target>) =>
      request<Target>('/api/targets', { method: 'POST', body: JSON.stringify(body) }),
    remove: (id: string) =>
      request<{ ok: true }>(`/api/targets/${id}`, { method: 'DELETE' }),
  },
  events: {
    list: (q: { source_id?: string; status?: string; q?: string; limit?: number } = {}) => {
      const p = new URLSearchParams();
      if (q.source_id) p.set('source_id', q.source_id);
      if (q.status) p.set('status', q.status);
      if (q.q) p.set('q', q.q);
      if (q.limit) p.set('limit', String(q.limit));
      return request<EventRow[]>(`/api/events${p.toString() ? `?${p}` : ''}`);
    },
    get: (id: string) => request<EventDetail>(`/api/events/${id}`),
    replay: (id: string) =>
      request<{ ok: true; eventId: string }>(`/api/events/${id}/replay`, { method: 'POST' }),
  },
  deliveries: {
    list: (q: { event_id?: string; status?: string; limit?: number } = {}) => {
      const p = new URLSearchParams();
      if (q.event_id) p.set('event_id', q.event_id);
      if (q.status) p.set('status', q.status);
      if (q.limit) p.set('limit', String(q.limit));
      return request<Delivery[]>(`/api/deliveries${p.toString() ? `?${p}` : ''}`);
    },
    retry: (id: string) =>
      request<{ ok: true }>(`/api/deliveries/${id}/retry`, { method: 'POST' }),
  },
};
