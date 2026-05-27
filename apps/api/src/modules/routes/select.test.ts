import { describe, expect, it } from 'vitest';
import { dispatch } from './select.js';

const event = {
  topic: 'invoice.paid',
  headers: {},
  body: Buffer.from(JSON.stringify({ amount: 4200 })),
};

describe('dispatch', () => {
  it('forwards every target when no route exists', () => {
    const out = dispatch([{ id: 't1' }, { id: 't2' }], [], event);
    expect(out).toEqual([
      { target: { id: 't1' }, forward: true },
      { target: { id: 't2' }, forward: true },
    ]);
  });

  it('forwards when a route exists with empty rules', () => {
    const out = dispatch(
      [{ id: 't1' }],
      [{ targetId: 't1', enabled: true, rules: {} }],
      event,
    );
    expect(out[0]!.forward).toBe(true);
  });

  it('drops when route is disabled', () => {
    const out = dispatch(
      [{ id: 't1' }],
      [{ targetId: 't1', enabled: false, rules: {} }],
      event,
    );
    expect(out[0]!.forward).toBe(false);
    expect(out[0]!.reason).toBe('route-disabled');
  });

  it('drops when drop:true', () => {
    const out = dispatch(
      [{ id: 't1' }],
      [{ targetId: 't1', enabled: true, rules: { drop: true } }],
      event,
    );
    expect(out[0]!.forward).toBe(false);
    expect(out[0]!.reason).toBe('drop-flag');
  });

  it('drops when where-clause mismatches', () => {
    const out = dispatch(
      [{ id: 't1' }],
      [
        {
          targetId: 't1',
          enabled: true,
          rules: { where: { topic: { eq: 'customer.created' } } },
        },
      ],
      event,
    );
    expect(out[0]!.forward).toBe(false);
    expect(out[0]!.reason).toBe('where-mismatch');
  });

  it('handles mix of forwarded and filtered targets', () => {
    const out = dispatch(
      [{ id: 'all' }, { id: 'only-paid' }, { id: 'only-customer' }, { id: 'disabled' }],
      [
        {
          targetId: 'only-paid',
          enabled: true,
          rules: { where: { topic: { in: ['invoice.paid'] } } },
        },
        {
          targetId: 'only-customer',
          enabled: true,
          rules: { where: { topic: { in: ['customer.created'] } } },
        },
        { targetId: 'disabled', enabled: false, rules: {} },
      ],
      event,
    );
    expect(out.map((d) => `${d.target.id}:${d.forward}`)).toEqual([
      'all:true',
      'only-paid:true',
      'only-customer:false',
      'disabled:false',
    ]);
  });

  it('preserves target order from input', () => {
    const targets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const out = dispatch(targets, [], event);
    expect(out.map((d) => d.target.id)).toEqual(['a', 'b', 'c']);
  });
});
