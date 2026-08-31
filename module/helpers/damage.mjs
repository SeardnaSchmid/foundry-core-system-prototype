/** One point of either damage kind lowers every roll threshold by one. */
export const DAMAGE_MALUS_PER_POINT = -1;

/**
 * Coerce a possibly missing or hand-edited field to a safe non-negative
 * number. Invalid values degrade to zero instead of poisoning derived data.
 * @param {*} value
 * @returns {number}
 */
function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

/**
 * Resolve the two raw damage counters against the character's trained
 * Strength. Each pool has its own budget of that full capacity — sharp damage
 * never eats into the room blunt damage has, and vice versa. Blunt converts to
 * effective sharp damage only once it has filled its *own* track; the stored
 * counters stay raw.
 *
 * @param {object} damage  Persisted `{sharp, blunt}` counters.
 * @param {number} capacity  Trained Strength (`abilities.str.base`), the budget
 *   of each pool separately, not of both together.
 * @returns {{sharp: number, blunt: number, capacity: number, bluntCarried: number, bluntConverted: number, effectiveSharp: number, total: number, malus: number, downed: boolean, full: boolean}}
 */
export function resolveDamage(damage, capacity) {
  const sharp = num(damage?.sharp);
  const blunt = num(damage?.blunt);
  const safeCapacity = num(capacity);
  const bluntCarried = Math.min(blunt, safeCapacity);
  const bluntConverted = Math.max(0, blunt - bluntCarried);
  const effectiveSharp = sharp + bluntConverted;
  const total = sharp + blunt;

  return {
    sharp,
    blunt,
    capacity: safeCapacity,
    bluntCarried,
    bluntConverted,
    effectiveSharp,
    total,
    malus: total ? total * DAMAGE_MALUS_PER_POINT : 0,
    downed: effectiveSharp > safeCapacity,
    full: sharp >= safeCapacity || blunt >= safeCapacity,
  };
}

/**
 * Boxes one row draws before it stops counting. Neither pool has an upper
 * bound — both are stepped by hand — so the ruler sets the limit rather than
 * the data; the row's tooltip still carries the true figures.
 */
export const DAMAGE_TRACK_MAX_BOXES = 12;

/**
 * Lay resolved damage out as the banner's two box rows: Wuchtschaden above
 * Scharfer Schaden. Both rulers are the same length, but each row measures its
 * own pool against its own budget — the rows are aligned, not shared.
 *
 * Blunt shows what still lies on its own track, and past the capacity mark what
 * has spilled off it. Sharp shows the raw pool followed by exactly that spill,
 * because converted blunt counts as sharp — which makes a box past the sharp
 * row's mark the Kampfunfähig condition itself rather than a second read-out of
 * it.
 *
 * Each row carries both its full name and a two-letter tag: the full name is far
 * too long to stand in the banner, but two rows of unnamed boxes are not
 * self-explanatory either, so the tag is what a reader identifies them by before
 * the tooltip spells it out.
 *
 * @param {ReturnType<typeof resolveDamage>} damage
 * @returns {Array<{kind: string, labelKey: string, tagKey: string, increaseKey: string, decreaseKey: string, value: number, free: number, boxes: Array<{tone: string}>, overflow: Array<{tone: string}>}>}
 */
export function damageTrackRows(damage) {
  const capacity = num(damage?.capacity);
  const sharp = num(damage?.sharp);
  const bluntCarried = num(damage?.bluntCarried);
  const bluntConverted = num(damage?.bluntConverted);
  const effectiveSharp = num(damage?.effectiveSharp);
  const slots = Math.min(capacity, DAMAGE_TRACK_MAX_BOXES);
  const track = (tone) => Array.from({ length: slots }, (_, index) => ({ tone: tone(index) }));
  const past = (count) =>
    Array.from({ length: Math.min(num(count), DAMAGE_TRACK_MAX_BOXES) }, () => ({ tone: 'over' }));

  return [
    {
      kind: 'blunt',
      labelKey: 'TNO.Damage.Blunt',
      tagKey: 'TNO.Damage.TagBlunt',
      increaseKey: 'TNO.Damage.IncreaseBlunt',
      decreaseKey: 'TNO.Damage.DecreaseBlunt',
      value: num(damage?.blunt),
      free: Math.max(0, capacity - bluntCarried),
      boxes: track((index) => (index < bluntCarried ? 'blunt' : 'empty')),
      overflow: past(bluntConverted),
    },
    {
      kind: 'sharp',
      labelKey: 'TNO.Damage.Sharp',
      tagKey: 'TNO.Damage.TagSharp',
      increaseKey: 'TNO.Damage.IncreaseSharp',
      decreaseKey: 'TNO.Damage.DecreaseSharp',
      value: sharp,
      free: Math.max(0, capacity - effectiveSharp),
      boxes: track((index) => {
        if (index < sharp) return 'sharp';
        return index < effectiveSharp ? 'converted' : 'empty';
      }),
      overflow: past(effectiveSharp - capacity),
    },
  ];
}
