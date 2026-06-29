import { describe, expect, it } from 'vitest';
import { toTsQuery } from './fts.js';

describe('toTsQuery', () => {
  it('returns empty for blank input', () => {
    expect(toTsQuery('')).toBe('');
    expect(toTsQuery('   ')).toBe('');
  });

  it('joins multiple tokens with &', () => {
    expect(toTsQuery('invoice paid')).toBe('invoice & paid');
  });

  it('splits dotted tokens', () => {
    expect(toTsQuery('invoice.paid')).toBe('invoice & paid');
  });

  it('supports prefix match with trailing *', () => {
    expect(toTsQuery('invoi*')).toBe('invoi:*');
  });

  it('supports negation with leading -', () => {
    expect(toTsQuery('invoice -draft')).toBe('invoice & !(draft)');
  });

  it('strips operator chars that could break to_tsquery', () => {
    expect(toTsQuery("'; DROP TABLE")).toBe('DROP & TABLE');
    expect(toTsQuery('a&|!()<>:b')).toBe('a & b');
  });

  it('keeps unicode letters', () => {
    expect(toTsQuery('café')).toBe('café');
  });
});
