/**
 * Color-grading logic ported from the "Attribut-Heatmap" prototype, so the
 * character sheet's attribute table shows at a glance where a character is
 * relatively strongest instead of just listing raw numbers.
 */

const CURVE_EXPONENT = 2.3;

// Attribute values have a fixed, rulebook-defined meaning independent of any
// one character's spread (1 = "you can park anywhere", 4 = average, 10 =
// best of your generation), so cells are graded against this absolute scale
// rather than the character's own min/max.
const ABSOLUTE_MIN = 1;
const ABSOLUTE_MAX = 10;

// Single-hue, saturation/lightness-driven palette (parchment-to-green)
// instead of a multi-hue sweep. Hue gradients read as discrete color
// categories with a muddy seam in between — brightness and saturation carry
// a continuous "how strong is this" signal far more clearly. Weak values
// fade to a near-desaturated parchment tone; strong values deepen into a
// fully saturated forest green. Hue only drifts slightly across the ramp,
// well short of the point where it reads as a hue change.
const HEAT_STOPS = [
  { hue: 90, sat: 20, light: 70 }, // weak — reads as the parchment page itself
  { hue: 120, sat: 40, light: 50 }, // mid — muted green
  { hue: 140, sat: 55, light: 28 }, // high — deep, saturated forest green
];

function interpolateStops(stops, t) {
  const n = stops.length - 1;
  const pos = Math.max(0, Math.min(1, t)) * n;
  const i = Math.min(n - 1, Math.floor(pos));
  const f = pos - i;
  const a = stops[i];
  const b = stops[i + 1];
  return {
    hue: a.hue + (b.hue - a.hue) * f,
    sat: a.sat + (b.sat - a.sat) * f,
    light: a.light + (b.light - a.light) * f,
  };
}

/**
 * Grade a single attribute cell against the rulebook's fixed 1-10 scale
 * (see "Bedeutung der Werte"), so a given value always reads the same
 * color regardless of the character's other stats. Values pushed above 10
 * by cyberware/drugs cap out at the top of the ramp.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @param {number} exponent
 * @returns {{bg: string, textColor: string, isPeak: boolean}}
 */
export function colorForValue(value, min = ABSOLUTE_MIN, max = ABSOLUTE_MAX, exponent = CURVE_EXPONENT) {
  const t = max === min ? 1 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const tp = Math.pow(t, exponent);
  const { hue, sat, light } = interpolateStops(HEAT_STOPS, tp);
  const textColor = light > 46 ? '#2A2419' : '#F3EFE4';
  return {
    bg: `hsl(${hue.toFixed(0)}deg ${sat.toFixed(0)}% ${light.toFixed(0)}%)`,
    textColor,
    isPeak: value === max,
  };
}

/**
 * Grade a row/column/total sum badge against its own fixed absolute range
 * (count attributes, each 1-10), independent of any other row/column's
 * sum — the same "reads the same color regardless of context" rule as
 * colorForValue, just scaled up by how many attributes feed the sum.
 *
 * @param {number} value
 * @param {number} count Number of attributes contributing to this sum.
 * @param {number} exponent
 * @returns {{bg: string, textColor: string, isPeak: boolean}}
 */
export function colorForSum(value, count, exponent = CURVE_EXPONENT) {
  const min = count * ABSOLUTE_MIN;
  const max = count * ABSOLUTE_MAX;
  const t = max === min ? 1 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const tp = Math.pow(t, exponent);
  const { hue, sat, light } = interpolateStops(HEAT_STOPS, tp);
  const textColor = light + 4 > 46 ? '#2A2419' : '#F3EFE4';
  return {
    bg: `hsl(${hue.toFixed(0)}deg ${sat.toFixed(0)}% ${(light + 4).toFixed(0)}%)`,
    textColor,
    isPeak: value === max,
  };
}
