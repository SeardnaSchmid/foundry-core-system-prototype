import { describe, it, expect } from 'vitest';
import { tempValueForBase, TEMP_MIN, TEMP_MAX } from '../../module/helpers/attributes.mjs';

describe('tempValueForBase', () => {
  it('follows the new base when no temporary modifier is active', () => {
    expect(tempValueForBase({ base: 4, value: 4 }, 5)).toBe(5);
  });

  it('keeps a temporary penalty when the base is raised by XP', () => {
    // 4 base, temporarily lowered to 2, advanced to base 5 -> still -2.
    expect(tempValueForBase({ base: 4, value: 2 }, 5)).toBe(3);
  });

  it('keeps a temporary bonus when the base is raised', () => {
    expect(tempValueForBase({ base: 4, value: 6 }, 5)).toBe(7);
  });

  it('keeps the modifier when the base is lowered again', () => {
    expect(tempValueForBase({ base: 5, value: 3 }, 4)).toBe(2);
  });

  it('clamps to the temp range', () => {
    expect(tempValueForBase({ base: 4, value: 0 }, 1)).toBe(TEMP_MIN);
    expect(tempValueForBase({ base: 4, value: 20 }, 10)).toBe(TEMP_MAX);
  });

  it('falls back to the base when no temp value is stored', () => {
    expect(tempValueForBase({ base: 4 }, 6)).toBe(6);
    expect(tempValueForBase(undefined, 6)).toBe(6);
  });
});
