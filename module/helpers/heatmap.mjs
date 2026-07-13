/**
 * Color-grading logic ported from the "Attribut-Heatmap" prototype, so the
 * character sheet's attribute table shows at a glance where a character is
 * relatively strongest instead of just listing raw numbers.
 */

const CURVE_EXPONENT = 2.3;

// Restraint-first palette: weak values recede into the parchment page (near-
// background tone), a modest single highlight marks mid-range, and a more
// dominant highlight is reserved for the true high end. Two accents total,
// not a full rainbow sweep.
const HEAT_STOPS = [
  { hue: 42, sat: 18, light: 68 }, // weak — reads as the parchment page itself
  { hue: 174, sat: 30, light: 40 }, // mid — modest teal accent
  { hue: 28, sat: 62, light: 50 }, // high — dominant amber/sienna accent
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
