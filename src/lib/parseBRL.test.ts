import { describe, it, expect } from 'vitest';
import { parseBRL, centsToInput } from './parseBRL';

describe('parseBRL', () => {
  it.each([
    ['1.299,90', 1299.9], ['189,90', 189.9], ['189.90', 189.9], ['49', 49],
    ['R$ 1.299,90', 1299.9], ['1299,9', 1299.9], ['1.299', 1299], ['12.345.678,00', 12345678],
    ['0,6', 0.6], ['1.299.90', 1299.9], [',5', 0.5],
  ])('%s -> %s', (input, expected) => {
    expect(parseBRL(input)).toBeCloseTo(expected, 6);
  });

  it.each(['', 'abc', '1,2,3', '12,345', '1.29,90', '1.2345'])('rejeita %s', input => {
    expect(parseBRL(input)).toBeNaN();
  });

  it('centsToInput usa vírgula', () => {
    expect(centsToInput(129990)).toBe('1299,90');
    expect(parseBRL(centsToInput(18990))).toBeCloseTo(189.9, 6);
  });
});
