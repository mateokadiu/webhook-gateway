import { z } from 'zod';

// ── Sources ────────────────────────────────────────────────────────────────
export const SourceSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1).max(64).regex(/^[a-z0-9-]+$/),
  label: z.string().min(1).max(120),
  pluginId: z.string().min(1).max(64),
  signingSecret: z.string().min(1),
  signatureToleranceSec: z.number().int().nonnegative().default(300),
  pluginConfig: z.record(z.string()).default({}),
  targetIds: z.array(z.string().uuid()).default([]),
  enabled: z.boolean().default(true),
  testMode: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Source = z.infer<typeof SourceSchema>;

export const SourceCreateSchema = SourceSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type SourceCreate = z.infer<typeof SourceCreateSchema>;

// ── Targets ────────────────────────────────────────────────────────────────
export const TargetSchema = z.object({
  id: z.string().uuid(),
  label: z.string().min(1).max(120),
  url: z.string().url(),
  signingSecret: z.string().nullable(),
  headers: z.record(z.string()).default({}),
  timeoutMs: z.number().int().positive().max(60_000).default(10_000),
  maxAttempts: z.number().int().positive().max(20).default(6),
  backoffSchedule: z.array(z.number().int().positive()).default([30, 120, 600, 3600, 21600, 86400]),
  enabled: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Target = z.infer<typeof TargetSchema>;

export const TargetCreateSchema = TargetSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type TargetCreate = z.infer<typeof TargetCreateSchema>;

// ── Events & deliveries ────────────────────────────────────────────────────
export const EventStatusSchema = z.enum([
  'queued',
  'processing',
  'ok',
  'partial',
  'failed',
  'tombstoned',
]);
export type EventStatus = z.infer<typeof EventStatusSchema>;

export const DeliveryStatusSchema = z.enum(['pending', 'retrying', 'ok', 'failed', 'dead']);
export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>;

export const EventSchema = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  topic: z.string().nullable(),
  dedupKey: z.string(),
  bodyHash: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  status: EventStatusSchema,
  fanOut: z.number().int().nonnegative(),
  fanOutOk: z.number().int().nonnegative(),
  fanOutFailed: z.number().int().nonnegative(),
  receivedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type Event = z.infer<typeof EventSchema>;

export const DeliverySchema = z.object({
  id: z.string().uuid(),
  eventId: z.string().uuid(),
  targetId: z.string().uuid(),
  attempt: z.number().int().nonnegative(),
  nextAttemptAt: z.string().datetime().nullable(),
  status: DeliveryStatusSchema,
  lastStatusCode: z.number().int().nullable(),
  lastResponseExcerpt: z.string().nullable(),
  lastAttemptAt: z.string().datetime().nullable(),
  totalDurationMs: z.number().int().nullable(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type Delivery = z.infer<typeof DeliverySchema>;
