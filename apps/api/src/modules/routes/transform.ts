import jsonata from 'jsonata';

export interface TransformOk {
  ok: true;
  body: Buffer;
}

export interface TransformErr {
  ok: false;
  reason: 'parse' | 'compile' | 'evaluate' | 'serialize';
  message: string;
}

export type TransformResult = TransformOk | TransformErr;

/**
 * Apply a JSONata expression to the JSON-parsed body and re-serialize.
 *
 * Failure modes — none of which throw to the caller:
 *   - `parse`     : body isn't valid JSON
 *   - `compile`   : expression isn't valid JSONata
 *   - `evaluate`  : expression threw at evaluation time
 *   - `serialize` : expression returned something that can't be JSON.stringify'd
 *
 * Caller decides what to do on failure — currently the processor falls back
 * to the original body and records the reason on the delivery excerpt.
 */
export async function applyTransform(
  expression: string | null | undefined,
  body: Buffer,
): Promise<TransformResult> {
  const expr = expression?.trim();
  if (!expr) return { ok: true, body };

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString('utf-8'));
  } catch (err) {
    return {
      ok: false,
      reason: 'parse',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  let compiled: ReturnType<typeof jsonata>;
  try {
    compiled = jsonata(expr);
  } catch (err) {
    return {
      ok: false,
      reason: 'compile',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  let evaluated: unknown;
  try {
    evaluated = await compiled.evaluate(parsed);
  } catch (err) {
    return {
      ok: false,
      reason: 'evaluate',
      message: err instanceof Error ? err.message : String(err),
    };
  }

  try {
    const serialized = JSON.stringify(evaluated);
    if (serialized === undefined) {
      return { ok: false, reason: 'serialize', message: 'expression returned undefined' };
    }
    return { ok: true, body: Buffer.from(serialized, 'utf-8') };
  } catch (err) {
    return {
      ok: false,
      reason: 'serialize',
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
