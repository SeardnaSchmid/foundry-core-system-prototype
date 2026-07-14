/**
 * Color-grading logic ported from the "Attribut-Heatmap" prototype, so the
 * character sheet's attribute table shows at a glance where a character is
 * relatively strongest instead of just listing raw numbers.
 */

const CURVE_EXPONENT = 2.3;

// Single-hue, saturation/lightness-driven palette (amber/sienna family, matching
// the parchment page) instead of a multi-hue sweep. Hue gradients read as
// discrete color categories with a muddy seam in between — brightness and
// saturation carry a continuous "how strong is this" signal far more clearly.
// Weak values fade to a near-desaturated parchment tone; strong values deepen
// into a fully saturated burnt sienna. Hue only drifts slightly (~12deg)
// across the ramp, well short of the point where it reads as a hue change.
const HEAT_STOPS = [
  { hue: 40, sat: 20, light: 70 }, // weak — reads as the parchment page itself
  { hue: 34, sat: 48, light: 55 }, // mid — warming gold
  { hue: 28, sat: 70, light: 34 }, // high — deep, saturated burnt sienna
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
 * Grade a single attribute cell against the character's own min/max base
 * value, so the palette is normalized per-character rather than to some
 * absolute 1-10 scale.
 *
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @param {number} exponent
 * @returns {{bg: string, textColor: string, isPeak: boolean}}
 */
export function colorForValue(value, min, max, exponent = CURVE_EXPONENT) {
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
 * Shape a row/column sum's ratio-to-max before it hits the palette stops.
 * Close top contenders (e.g. 21/20/19 out of a max of 21) should all read
 * close to the dominant highlight, graded by closeness — not just the
 * single max lighting up and everyone else (including near-ties) dropping
 * back to a modest color. True outliers at the bottom still recede to
 * parchment fast.
 */
function badgeShapeT(t, exponent) {
  const top = 0.85;
  if (t >= top) {
    return 0.7 + ((t - top) / (1 - top)) * 0.3; // top 15% of range -> 0.7..1
  }
  const steepPower = Math.max(2.5, exponent * 1.2);
  return Math.pow(t / top, steepPower) * 0.4;
}

/**
 * Grade a row/column sum badge relative to the group's max only (not its
 * min-max spread), so close sums (e.g. 19/20/21) render as close colors
 * instead of being stretched across the whole scale just because they
 * happen to be the local min/max.
 *
 * @param {number} value
 * @param {number} max
 * @param {number} exponent
 * @returns {{bg: string, textColor: string, isPeak: boolean}}
 */
export function colorForRelativeToMax(value, max, exponent = CURVE_EXPONENT) {
  const t = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const tp = badgeShapeT(t, exponent);
  const { hue, sat, light } = interpolateStops(HEAT_STOPS, tp);
  const textColor = light > 46 ? '#2A2419' : '#F3EFE4';
  return {
    bg: `hsl(${hue.toFixed(0)}deg ${sat.toFixed(0)}% ${(light + 4).toFixed(0)}%)`,
    textColor,
    isPeak: value === max,
  };
}
