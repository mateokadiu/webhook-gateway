/**
 * SignatureVerifier — the one interface a webhook-gateway plugin implements.
 * Verifiers are loaded by name (id) from packages listed in the api's
 * WEBHOOK_GATEWAY_PLUGINS env var. Sources reference plugins via `pluginId`.
 */
export interface SignatureVerifier {
  /** Stable identifier matched against sources.plugin_id. Lowercase, alphanumeric, dashes. */
  readonly id: string;

  /** Verify the inbound request. Throw or return false to reject. */
  verify(input: VerifyInput): boolean | Promise<boolean>;

  /** Optional — extract a source-native idempotency key (e.g. Stripe event id).
   *  When absent, the gateway falls back to sha256(rawBody). */
  extractIdempotencyKey?(input: BasicInput): string | null;

  /** Optional — extract a topic for routing (e.g. Stripe event.type, GitHub
   *  X-GitHub-Event). Stored on events.topic. */
  extractTopic?(input: BasicInput): string | null;
}

export interface BasicInput {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

export interface VerifyInput extends BasicInput {
  /** Per-source signing secret pulled from sources.signing_secret. */
  secret: string;
  /** Per-source time-skew tolerance in seconds. Default 300. */
  tolerance?: number;
  /** Per-source plugin-specific config (sources.plugin_config). */
  config?: Record<string, string>;
}

/** Read a header case-insensitively. Returns the first occurrence as a string,
 *  or null when missing. Helpers like Stripe send their signature as the
 *  value of a known header; this just normalises the lookup. */
export function pickHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | null {
  const wanted = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === wanted) {
      const v = headers[key];
      if (Array.isArray(v)) return v[0] ?? null;
      return v ?? null;
    }
  }
  return null;
}
