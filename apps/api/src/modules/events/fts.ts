/**
 * Translate a free-form user query into a safe `to_tsquery` expression.
 *
 * Strategy: split on whitespace, strip everything that isn't word-class or
 * `-` (negation) or `*` (prefix), join with `&`. Empty tokens drop out.
 * Caller wraps the result in `to_tsquery('simple', ...)`.
 */
export function toTsQuery(input: string): string {
  const tokens = input
    .split(/\s+/)
    .map((raw) => sanitizeToken(raw))
    .filter((t) => t.length > 0);
  if (tokens.length === 0) return '';
  return tokens.join(' & ');
}

function sanitizeToken(raw: string): string {
  let negate = false;
  let t = raw;
  if (t.startsWith('-') && t.length > 1) {
    negate = true;
    t = t.slice(1);
  }
  // Keep alphanumerics, underscore, dot (so 'invoice.paid' becomes 'invoice & paid').
  // Allow trailing `*` for prefix match.
  const trailingStar = t.endsWith('*');
  const core = t
    .replace(/\*+$/, '')
    .split(/[^\p{L}\p{N}_]+/u)
    .filter((s) => s.length > 0)
    .join(' & ');
  if (!core) return '';
  const withPrefix = trailingStar ? `${core}:*` : core;
  return negate ? `!(${withPrefix})` : withPrefix;
}
