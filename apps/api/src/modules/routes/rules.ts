/**
 * Route-rules DSL.
 *
 * Persisted as JSONB on `routes.rules`. Tiny, declarative, no expression
 * language — operators are explicit. Designed so an operator can edit it in
 * an admin form without surprises.
 *
 * Shape:
 *
 *   {
 *     "where": {
 *       "topic":      { "in": ["invoice.paid", "invoice.failed"] },
 *       "body.amount":{ "gte": 1000 },
 *       "headers.x-source": { "eq": "stripe-prod" }
 *     },
 *     "drop": false
 *   }
 *
 * Path resolution:
 *   - `topic`                 → event.topic
 *   - `headers.<name>`        → event.headers[name] (case-insensitive)
 *   - `body.<dot.path>`       → JSON-parsed body, then walk `dot.path`
 *
 * If `where` is empty/missing, the rule matches everything. If `drop` is
 * `true`, a matching delivery is filtered out (processor records a
 * `filter-skip` outcome on the delivery and rolls up the event normally).
 *
 * Mismatch on `where` → drop (we only forward when all clauses pass).
 */

export type Op =
  | { eq: unknown }
  | { neq: unknown }
  | { in: readonly unknown[] }
  | { nin: readonly unknown[] }
  | { gt: number }
  | { gte: number }
  | { lt: number }
  | { lte: number }
  | { contains: string }
  | { regex: string }
  | { exists: boolean };

export interface RouteRules {
  where?: Record<string, Op>;
  drop?: boolean;
}

export interface RouteEvalInput {
  topic: string | null;
  headers: Record<string, unknown>;
  body: Buffer;
}

export type RouteEvalResult =
  | { forward: true }
  | { forward: false; reason: 'drop-flag' | 'where-mismatch' | 'rule-error'; detail?: string };

/**
 * Pure evaluator. Never throws on bad input — bad rules log out and short-circuit
 * to `{ forward: false, reason: 'rule-error' }`, which the processor records.
 */
export function evaluateRules(rules: RouteRules | null | undefined, input: RouteEvalInput): RouteEvalResult {
  if (!rules || typeof rules !== 'object') return { forward: true };
  if (rules.drop === true) return { forward: false, reason: 'drop-flag' };

  const where = rules.where;
  if (!where || Object.keys(where).length === 0) return { forward: true };

  let body: unknown = null;
  let bodyParsed = false;

  for (const [path, op] of Object.entries(where)) {
    let value: unknown;
    if (path === 'topic') {
      value = input.topic;
    } else if (path.startsWith('headers.')) {
      const headerName = path.slice('headers.'.length).toLowerCase();
      value = lookupHeader(input.headers, headerName);
    } else if (path === 'body' || path.startsWith('body.')) {
      if (!bodyParsed) {
        body = tryParseJson(input.body);
        bodyParsed = true;
      }
      const sub = path === 'body' ? '' : path.slice('body.'.length);
      value = sub === '' ? body : walk(body, sub);
    } else {
      // Unknown root — treat as missing.
      value = undefined;
    }

    const ok = applyOp(value, op);
    if (!ok) return { forward: false, reason: 'where-mismatch', detail: path };
  }
  return { forward: true };
}

function applyOp(value: unknown, op: Op): boolean {
  try {
    if ('eq' in op) return value === op.eq;
    if ('neq' in op) return value !== op.neq;
    if ('in' in op) return Array.isArray(op.in) && op.in.includes(value as never);
    if ('nin' in op) return Array.isArray(op.nin) && !op.nin.includes(value as never);
    if ('exists' in op) return op.exists ? value !== undefined && value !== null : value === undefined || value === null;
    if ('contains' in op) return typeof value === 'string' && value.includes(String(op.contains));
    if ('regex' in op) return typeof value === 'string' && new RegExp(op.regex).test(value);
    if ('gt' in op) return typeof value === 'number' && value > op.gt;
    if ('gte' in op) return typeof value === 'number' && value >= op.gte;
    if ('lt' in op) return typeof value === 'number' && value < op.lt;
    if ('lte' in op) return typeof value === 'number' && value <= op.lte;
  } catch {
    return false;
  }
  return false;
}

function tryParseJson(body: Buffer): unknown {
  try {
    return JSON.parse(body.toString('utf-8'));
  } catch {
    return null;
  }
}

function walk(root: unknown, path: string): unknown {
  if (root == null) return undefined;
  const segments = path.split('.');
  let cur: unknown = root;
  for (const seg of segments) {
    if (cur == null) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

function lookupHeader(headers: Record<string, unknown>, name: string): unknown {
  if (name in headers) return headers[name];
  // Case-insensitive fallback.
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === name) return v;
  }
  return undefined;
}
