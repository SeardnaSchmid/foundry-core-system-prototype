// Value ranges from the "Attribut-Heatmap" spec: Basiswert (base) is the
// trained/leveled rating, Temp-Wert (value) is the current, independently
// adjustable play value shown large in "temp" mode.
export const BASE_MIN = 1;
export const BASE_MAX = 10;
export const TEMP_MIN = 0;
export const TEMP_MAX = 20;

/**
 * The temp value an ability should get once its base moves to `nextBase`.
 *
 * Any temporary modifier — a wound penalty, a drug bonus — is stored as the
 * gap between `value` and `base`, so raising the base (by XP advancement or
 * the base stepper) has to carry that gap along instead of snapping the temp
 * value back onto the new base and silently curing the character.
 *
 * @param {{base?: number, value?: number}} ability  The ability before the change.
 * @param {number} nextBase                          The new base rating.
 * @returns {number} The new temp value, clamped to the temp range.
 */
export function tempValueForBase(ability, nextBase) {
  const base = ability?.base ?? 0;
  const value = ability?.value ?? base;
  return Math.min(TEMP_MAX, Math.max(TEMP_MIN, nextBase + (value - base)));
}
