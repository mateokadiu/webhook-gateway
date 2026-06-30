import { describe, expect, it } from 'vitest';
import { evaluateRules } from './rules.js';

function input(overrides: Partial<{ topic: string | null; headers: Record<string, unknown>; body: unknown }> = {}) {
  const body = overrides.body === undefined ? { type: 'invoice.paid', amount: 4200 } : overrides.body;
  const topic = 'topic' in overrides ? (overrides.topic ?? null) : 'invoice.paid';
  return {
    topic,
    headers: overrides.headers ?? { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify(body)),
  };
}

describe('evaluateRules', () => {
  it('forwards when rules are null/empty', () => {
    expect(evaluateRules(null, input())).toEqual({ forward: true });
    expect(evaluateRules({}, input())).toEqual({ forward: true });
    expect(evaluateRules({ where: {} }, input())).toEqual({ forward: true });
  });

  it('respects drop flag', () => {
    expect(evaluateRules({ drop: true }, input())).toEqual({ forward: false, reason: 'drop-flag' });
  });

  it('matches topic via in', () => {
    const rules = { where: { topic: { in: ['invoice.paid', 'invoice.failed'] } } };
    expect(evaluateRules(rules, input({ topic: 'invoice.paid' })).forward).toBe(true);
    expect(evaluateRules(rules, input({ topic: 'customer.created' })).forward).toBe(false);
  });

  it('walks body.* JSON paths', () => {
    const rules = { where: { 'body.amount': { gte: 1000 } } };
    expect(evaluateRules(rules, input({ body: { amount: 4200 } })).forward).toBe(true);
    expect(evaluateRules(rules, input({ body: { amount: 100 } })).forward).toBe(false);
  });

  it('walks nested body paths', () => {
    const rules = { where: { 'body.data.object.id': { eq: 'cus_123' } } };
    const body = { data: { object: { id: 'cus_123', email: 'x@y.z' } } };
    expect(evaluateRules(rules, input({ body })).forward).toBe(true);
  });

  it('headers.* is case-insensitive', () => {
    const rules = { where: { 'headers.x-stripe-event-id': { eq: 'evt_1' } } };
    const ok = evaluateRules(rules, input({ headers: { 'X-Stripe-Event-ID': 'evt_1' } }));
    expect(ok.forward).toBe(true);
  });

  it('returns where-mismatch with path detail', () => {
    const rules = { where: { topic: { eq: 'shouldnt-match' } } };
    const res = evaluateRules(rules, input());
    expect(res).toEqual({ forward: false, reason: 'where-mismatch', detail: 'topic' });
  });

  it('combines multiple clauses with AND', () => {
    const rules = {
      where: {
        topic: { eq: 'invoice.paid' },
        'body.amount': { gte: 1000 },
      },
    };
    expect(evaluateRules(rules, input({ topic: 'invoice.paid', body: { amount: 5000 } })).forward).toBe(true);
    expect(evaluateRules(rules, input({ topic: 'invoice.paid', body: { amount: 100 } })).forward).toBe(false);
  });

  it('contains and regex on strings', () => {
    expect(evaluateRules({ where: { topic: { contains: 'paid' } } }, input()).forward).toBe(true);
    expect(evaluateRules({ where: { topic: { regex: '^invoice\\.' } } }, input()).forward).toBe(true);
    expect(evaluateRules({ where: { topic: { regex: '^customer\\.' } } }, input()).forward).toBe(false);
  });

  it('exists checks for null/undefined', () => {
    expect(evaluateRules({ where: { topic: { exists: true } } }, input()).forward).toBe(true);
    expect(evaluateRules({ where: { topic: { exists: false } } }, input({ topic: null })).forward).toBe(true);
  });

  it('handles non-JSON body without throwing', () => {
    const rules = { where: { 'body.foo': { eq: 'bar' } } };
    const inp = {
      topic: 't',
      headers: {},
      body: Buffer.from('not-json'),
    };
    const res = evaluateRules(rules, inp);
    expect(res.forward).toBe(false);
  });

  it('bad regex returns where-mismatch (does not throw)', () => {
    const rules = { where: { topic: { regex: '[invalid' } } };
    const res = evaluateRules(rules, input());
    expect(res.forward).toBe(false);
  });
});
