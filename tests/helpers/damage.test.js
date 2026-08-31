import { describe, expect, it } from 'vitest';

import {
  DAMAGE_MALUS_PER_POINT,
  DAMAGE_TRACK_MAX_BOXES,
  damageTrackRows,
  resolveDamage,
} from '../../module/helpers/damage.mjs';

describe('resolveDamage', () => {
  it('accumulates both raw pools and applies one malus per point', () => {
    expect(DAMAGE_MALUS_PER_POINT).toBe(-1);
    expect(resolveDamage({ sharp: 2, blunt: 3 }, 8)).toMatchObject({
      sharp: 2,
      blunt: 3,
      total: 5,
      malus: -5,
      bluntCarried: 3,
      bluntConverted: 0,
      effectiveSharp: 2,
      downed: false,
    });
  });

  it('gives each pool its own budget instead of letting sharp damage crowd blunt out', () => {
    expect(resolveDamage({ sharp: 3, blunt: 4 }, 5)).toMatchObject({
      bluntCarried: 4,
      bluntConverted: 0,
      effectiveSharp: 3,
      downed: false,
      full: false,
    });
  });

  it('converts blunt damage only once it has filled its own track', () => {
    expect(resolveDamage({ sharp: 3, blunt: 7 }, 5)).toMatchObject({
      bluntCarried: 5,
      bluntConverted: 2,
      effectiveSharp: 5,
      total: 10,
      malus: -10,
    });
  });

  it('incapacitates only once effective sharp damage is strictly greater than capacity', () => {
    expect(resolveDamage({ sharp: 3, blunt: 7 }, 5).downed).toBe(false);
    expect(resolveDamage({ sharp: 3, blunt: 8 }, 5).downed).toBe(true);
  });

  it('counts converted damage once rather than adding it to the raw total again', () => {
    expect(resolveDamage({ sharp: 4, blunt: 8 }, 5)).toMatchObject({
      bluntConverted: 3,
      total: 12,
      malus: -12,
    });
  });

  it('reports a full track as soon as either pool alone reaches capacity', () => {
    expect(resolveDamage({ sharp: 4, blunt: 4 }, 5).full).toBe(false);
    expect(resolveDamage({ sharp: 5, blunt: 0 }, 5).full).toBe(true);
    expect(resolveDamage({ sharp: 0, blunt: 5 }, 5).full).toBe(true);
  });

  it('handles zero capacity without division or special storage', () => {
    expect(resolveDamage({ sharp: 0, blunt: 0 }, 0)).toMatchObject({ downed: false, malus: 0 });
    expect(resolveDamage({ sharp: 0, blunt: 1 }, 0)).toMatchObject({
      bluntCarried: 0,
      bluntConverted: 1,
      effectiveSharp: 1,
      downed: true,
    });
  });

  it('degrades missing, negative and non-numeric fields to safe counters', () => {
    expect(resolveDamage({ sharp: 'hurt', blunt: -4 }, 'weak')).toMatchObject({
      sharp: 0,
      blunt: 0,
      capacity: 0,
      total: 0,
      malus: 0,
      downed: false,
    });
  });
});

describe('damageTrackRows', () => {
  /** Both rows of the banner block, as `{blunt, sharp}` rather than by index. */
  const rows = (damage, capacity) => {
    const [blunt, sharp] = damageTrackRows(resolveDamage(damage, capacity));
    return { blunt, sharp };
  };
  const tones = (row) => row.boxes.map((box) => box.tone);

  it('draws Wuchtschaden above Scharfer Schaden, each row on its own budget', () => {
    const { blunt, sharp } = rows({ sharp: 1, blunt: 3 }, 4);

    expect(blunt.kind).toBe('blunt');
    expect(sharp.kind).toBe('sharp');
    expect(tones(blunt)).toEqual(['blunt', 'blunt', 'blunt', 'empty']);
    expect(tones(sharp)).toEqual(['sharp', 'empty', 'empty', 'empty']);
    // Three blunt points leave the sharp row all but one of its own four boxes.
    expect([blunt.free, sharp.free]).toEqual([1, 3]);
    expect([blunt.overflow, sharp.overflow]).toEqual([[], []]);
  });

  it('sends blunt damage past its own mark and lands the same points in the sharp row', () => {
    const { blunt, sharp } = rows({ sharp: 1, blunt: 6 }, 4);

    expect(tones(blunt)).toEqual(['blunt', 'blunt', 'blunt', 'blunt']);
    expect(blunt.overflow).toHaveLength(2);
    expect(tones(sharp)).toEqual(['sharp', 'converted', 'converted', 'empty']);
    expect(sharp.overflow).toEqual([]);
  });

  it('puts a box past the sharp row mark exactly when the character is kampfunfähig', () => {
    expect(rows({ sharp: 1, blunt: 6 }, 4).sharp.overflow).toEqual([]);
    expect(resolveDamage({ sharp: 1, blunt: 6 }, 4).downed).toBe(false);

    const { sharp } = rows({ sharp: 1, blunt: 8 }, 4);
    expect(sharp.overflow).toHaveLength(1);
    expect(sharp.free).toBe(0);
    expect(resolveDamage({ sharp: 1, blunt: 8 }, 4).downed).toBe(true);
  });

  it('stops drawing boxes before a hand-stepped pool runs off the banner', () => {
    const { blunt, sharp } = rows({ sharp: 40, blunt: 40 }, 30);

    expect(blunt.boxes).toHaveLength(DAMAGE_TRACK_MAX_BOXES);
    expect(sharp.overflow).toHaveLength(DAMAGE_TRACK_MAX_BOXES);
    // The figures the tooltip states stay true to the pools, not to the ruler.
    expect(sharp.value).toBe(40);
    expect(blunt.value).toBe(40);
  });
});
