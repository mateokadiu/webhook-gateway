import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  boolean,
  date,
  jsonb,
  customType,
  unique,
  index,
  check,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const sources = pgTable('sources', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: text('slug').notNull().unique(),
  label: text('label').notNull(),
  pluginId: text('plugin_id').notNull(),
  signingSecret: text('signing_secret').notNull(),
  signatureToleranceSec: integer('signature_tolerance_sec').notNull().default(300),
  pluginConfig: jsonb('plugin_config').notNull().default(sql`'{}'::jsonb`),
  targetIds: uuid('target_ids').array().notNull().default(sql`'{}'::uuid[]`),
  enabled: boolean('enabled').notNull().default(true),
  testMode: boolean('test_mode').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const targets = pgTable('targets', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  label: text('label').notNull(),
  url: text('url').notNull(),
  signingSecret: text('signing_secret'),
  headers: jsonb('headers').notNull().default(sql`'{}'::jsonb`),
  timeoutMs: integer('timeout_ms').notNull().default(10_000),
  maxAttempts: integer('max_attempts').notNull().default(6),
  backoffSchedule: integer('backoff_schedule')
    .array()
    .notNull()
    .default(sql`ARRAY[30,120,600,3600,21600,86400]::integer[]`),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    topic: text('topic'),
    dedupKey: text('dedup_key').notNull(),
    body: bytea('body').notNull(),
    bodyHash: text('body_hash').notNull(),
    headers: jsonb('headers').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    status: text('status').notNull(),
    fanOut: integer('fan_out').notNull().default(0),
    fanOutOk: integer('fan_out_ok').notNull().default(0),
    fanOutFailed: integer('fan_out_failed').notNull().default(0),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    sourceDedupUnique: unique('events_source_dedup_unique').on(t.sourceId, t.dedupKey),
    statusCheck: check(
      'events_status_check',
      sql`${t.status} in ('queued','processing','ok','partial','failed','tombstoned')`,
    ),
    receivedIdx: index('events_received_idx').on(t.receivedAt),
    sourceStatusIdx: index('events_source_status_idx').on(t.sourceId, t.status, t.receivedAt),
  }),
);

export const deliveries = pgTable(
  'deliveries',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => targets.id, { onDelete: 'cascade' }),
    attempt: integer('attempt').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    status: text('status').notNull(),
    lastStatusCode: integer('last_status_code'),
    lastResponseExcerpt: text('last_response_excerpt'),
    lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true }),
    totalDurationMs: integer('total_duration_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    statusCheck: check(
      'deliveries_status_check',
      sql`${t.status} in ('pending','retrying','ok','failed','dead')`,
    ),
    eventIdx: index('deliveries_event_idx').on(t.eventId),
    statusIdx: index('deliveries_status_idx').on(t.status, t.nextAttemptAt),
  }),
);

export const sourceStatsDaily = pgTable(
  'source_stats_daily',
  {
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    eventsReceived: integer('events_received').notNull().default(0),
    eventsOk: integer('events_ok').notNull().default(0),
    eventsFailed: integer('events_failed').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sourceId, t.date] }),
  }),
);
