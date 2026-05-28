import { describe, expect, it } from 'vitest';
import { applyTransform } from './transform.js';

const body = Buffer.from(JSON.stringify({ type: 'invoice.paid', amount: 4200 }));

describe('applyTransform', () => {
  it('returns body untouched when expression is empty', async () => {
    const out = await applyTransform('', body);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.body.equals(body)).toBe(true);
  });

  it('returns body untouched when expression is null', async () => {
    const out = await applyTransform(null, body);
    expect(out.ok).toBe(true);
  });

  it('rewrites body via jsonata expression', async () => {
    const out = await applyTransform('{ "kind": type, "cents": amount }', body);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(JSON.parse(out.body.toString('utf-8'))).toEqual({ kind: 'invoice.paid', cents: 4200 });
    }
  });

  it('reports parse failure for non-JSON body', async () => {
    const out = await applyTransform('$', Buffer.from('not-json'));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('parse');
  });

  it('reports compile failure for bad expression', async () => {
    const out = await applyTransform('{[', body);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('compile');
  });

  it('reports serialize failure when result is undefined', async () => {
    const out = await applyTransform('does.not.exist', body);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('serialize');
  });

  it('supports array result', async () => {
    const out = await applyTransform('[type, amount]', body);
    expect(out.ok).toBe(true);
    if (out.ok) expect(JSON.parse(out.body.toString('utf-8'))).toEqual(['invoice.paid', 4200]);
  });
});
