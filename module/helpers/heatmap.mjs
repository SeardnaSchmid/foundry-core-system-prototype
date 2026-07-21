/**
 * Color-grading logic ported from the "Attribut-Heatmap" prototype, so the
 * character sheet's attribute table shows at a glance where a character is
 * relatively strongest instead of just listing raw numbers.
 *
 * The gradient is fully user-tunable:
 *  - three color stops (low/mid/high)
 *  - the attribute value at which the middle stop sits (midValue) — moving
 *    it shifts how much of the 1-10 range each side of the gradient covers
 *  - an independent curve per segment (lowCurve/highCurve) — 1 is linear;
 *    above 1 keeps most of that segment close to its start color before a
 *    sharp swing near the pivot/end (banding); below 1 does the opposite
 *  - a dedicated color for "critical" cells (temp value at rock bottom),
 *    which sits outside the 1-10 gradient entirely
 *
 * See apps/heatmap-lab.mjs for the live editor UI, wired up through the
 * "Heatmap-Stil" settings menu.
 */

// Attribute values have a fixed, rulebook-defined meaning independent of any
// one character's spread (1 = "you can park anywhere", 4 = average, 10 =
// best of your generation), so cells are graded against this absolute scale
// rather than the character's own min/max.
const ABSOLUTE_MIN = 1;
const ABSOLUTE_MAX = 10;

// Kept a half-step inside the absolute range so both gradient segments
// (low->mid, mid->high) always have a non-zero width.
export const MID_VALUE_MIN = ABSOLUTE_MIN + 0.5;
export const MID_VALUE_MAX = ABSOLUTE_MAX - 0.5;

export const CURVE_MIN = 0.3;
export const CURVE_MAX = 3;

/**
 * A handful of starting points for the live editor — pick one, then tweak
 * the stops/midpoint/curves from there. Not a fixed enum: any config shape
 * below is valid and can be saved as the active config.
 *
 * All but "banded" are 3-stop approximations (value taken at t=0/0.5/1) of
 * established, perceptually-uniform scientific colormaps (matplotlib et
 * al.), rather than hand-picked colors — chosen because they're designed so
 * relative brightness tracks relative magnitude accurately (no "muddy
 * middle" a human eye misreads as higher/lower than it is) and several are
 * built to still read correctly under color-vision deficiency.
 */
export const HEATMAP_QUICK_PRESETS = {
  // Viridis (matplotlib default since 2.0): dark violet -> teal -> yellow.
  // The reference perceptually-uniform, colorblind-safe colormap.
  viridis: {
    label: 'TNO.HeatmapPreset.Viridis',
    low: '#440154',
    mid: '#21918c',
    high: '#fde725',
    midValue: 4.5,
    lowCurve: 1,
    highCurve: 1,
    critical: '#3d1418',
  },
  // Plasma: dark indigo -> magenta -> yellow. Same design family as
  // Viridis (matplotlib/cmocean), warmer in tone.
  plasma: {
    label: 'TNO.HeatmapPreset.Plasma',
    low: '#0d0887',
    mid: '#cc4778',
    high: '#f0f921',
    midValue: 4.5,
    lowCurve: 1,
    highCurve: 1,
    critical: '#3d1418',
  },
  // Inferno: near-black -> crimson -> pale yellow. High-contrast member of
  // the same perceptually-uniform family, good for dark UIs.
  inferno: {
    label: 'TNO.HeatmapPreset.Inferno',
    low: '#000004',
    mid: '#bb3754',
    high: '#fcffa4',
    midValue: 4.5,
    lowCurve: 1,
    highCurve: 1,
    critical: '#3d1418',
  },
  // Magma: near-black -> magenta -> pale cream. Inferno's cooler sibling.
  magma: {
    label: 'TNO.HeatmapPreset.Magma',
    low: '#000004',
    mid: '#b63679',
    high: '#fcfdbf',
    midValue: 4.5,
    lowCurve: 1,
    highCurve: 1,
    critical: '#3d1418',
  },
  // Cividis: navy -> grey -> gold. Purpose-built so red-green colorblind
  // and fully-sighted viewers perceive the same value ordering.
  cividis: {
    label: 'TNO.HeatmapPreset.Cividis',
    low: '#00204d',
    mid: '#7c7b78',
    high: '#ffea46',
    midValue: 4.5,
    lowCurve: 1,
    highCurve: 1,
    critical: '#3d1418',
  },
  // Turbo (Google AI, 2019): an improved rainbow map — wide hue sweep like
  // classic "jet" but smoothed to avoid jet's misleading perceptual banding.
  turbo: {
    label: 'TNO.HeatmapPreset.Turbo',
    low: '#30123b',
    mid: '#29bf12',
    high: '#7a0403',
    midValue: 4.5,
    lowCurve: 1,
    highCurve: 1,
    critical: '#3d1418',
  },
  // Coolwarm: blue -> near-white -> red. The standard diverging map for
  // "below/at/above a reference point" scientific heatmaps and dashboards.
  coolwarm: {
    label: 'TNO.HeatmapPreset.Coolwarm',
    low: '#3b4cc0',
    mid: '#dddddd',
    high: '#b40426',
    midValue: 4.5,
    lowCurve: 1,
    highCurve: 1,
    critical: '#3d1418',
  },
  // Greys: white -> mid grey -> black. The classic print-safe sequential
  // scale, included alongside the color maps above.
  greys: {
    label: 'TNO.HeatmapPreset.Greys',
    low: '#ffffff',
    mid: '#969696',
    high: '#000000',
    midValue: 4.5,
    lowCurve: 1,
    highCurve: 1,
    critical: '#5c1414',
  },
  // Demonstrates the curve controls: the low segment stays close to "low"
  // for most of its span then swings hard into "mid" right at the pivot
  // (steep lowCurve), while the high segment ramps gently and evenly all
  // the way to "high" (linear highCurve) — a sharper "bad" cutoff than the
  // other presets' plain linear ramps.
  banded: {
    label: 'TNO.HeatmapPreset.Banded',
    low: '#ebece9',
    mid: '#67c44f',
    high: '#054224',
    midValue: 6.5,
    lowCurve: 2.2,
    highCurve: 0.8,
    critical: '#3d1418',
  },
};

export const DEFAULT_HEATMAP_CONFIG = {
  low: HEATMAP_QUICK_PRESETS.banded.low,
  mid: HEATMAP_QUICK_PRESETS.banded.mid,
  high: HEATMAP_QUICK_PRESETS.banded.high,
  midValue: HEATMAP_QUICK_PRESETS.banded.midValue,
  lowCurve: HEATMAP_QUICK_PRESETS.banded.lowCurve,
  highCurve: HEATMAP_QUICK_PRESETS.banded.highCurve,
  critical: HEATMAP_QUICK_PRESETS.banded.critical,
};

let activeConfig = { ...DEFAULT_HEATMAP_CONFIG };

/**
 * Merge a partial config into the active gradient config used by subsequent
 * colorForValue()/colorForCritical() calls. midValue/lowCurve/highCurve are
 * clamped to their sane ranges; colors are passed through as-is (expected
 * to be "#rrggbb").
 * @param {Partial<{low: string, mid: string, high: string, midValue: number, lowCurve: number, highCurve: number, critical: string}>} config
 */
export function setActiveHeatmapConfig(config = {}) {
  activeConfig = {
    ...activeConfig,
    ...config,
    midValue: Math.max(MID_VALUE_MIN, Math.min(MID_VALUE_MAX, config.midValue ?? activeConfig.midValue)),
    lowCurve: Math.max(CURVE_MIN, Math.min(CURVE_MAX, config.lowCurve ?? activeConfig.lowCurve)),
    highCurve: Math.max(CURVE_MIN, Math.min(CURVE_MAX, config.highCurve ?? activeConfig.highCurve)),
  };
}

/**
 * @returns {object} a copy of the active gradient config
 */
export function getActiveHeatmapConfig() {
  return { ...activeConfig };
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  const toHex = (x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function lerpRgb(a, b, f) {
  return {
    r: a.r + (b.r - a.r) * f,
    g: a.g + (b.g - a.g) * f,
    b: a.b + (b.b - a.b) * f,
  };
}

/**
 * Perceptual luminance (ITU-R BT.601) decides whether dark or light text
 * stays legible against an arbitrary user-picked background color.
 */
function textColorFor(rgb) {
  const luminance = 0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b;
  return luminance > 140 ? '#2A2419' : '#F3EFE4';
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
 * @param {object} [config] defaults to the active config
 * @returns {{bg: string, textColor: string, isPeak: boolean}}
 */
export function colorForValue(value, min = ABSOLUTE_MIN, max = ABSOLUTE_MAX, config = activeConfig) {
  const v = Math.max(min, Math.min(max, value));
  const mid = Math.max(min, Math.min(max, config.midValue));

  const lowRgb = hexToRgb(config.low);
  const midRgb = hexToRgb(config.mid);
  const highRgb = hexToRgb(config.high);

  // Two independently-sized segments (low->mid, mid->high), split at the
  // chosen midpoint value rather than always at the range's center — e.g. a
  // midpoint of 4.5 gives the low->mid segment values 1-4.5 and the mid->high
  // segment the wider 4.5-10 span. Each segment additionally applies its own
  // curve exponent to its local 0-1 fraction: 1 is a plain linear ramp,
  // >1 holds close to the segment's start color before swinging hard near
  // its end (useful for a sharp "this is bad" cutoff), <1 does the reverse.
  let rgb;
  if (v <= mid) {
    const t = mid === min ? 1 : (v - min) / (mid - min);
    rgb = lerpRgb(lowRgb, midRgb, Math.pow(t, config.lowCurve ?? 1));
  } else {
    const t = max === mid ? 1 : (v - mid) / (max - mid);
    rgb = lerpRgb(midRgb, highRgb, Math.pow(t, config.highCurve ?? 1));
  }

  return {
    bg: rgbToHex(rgb),
    textColor: textColorFor(rgb),
    isPeak: value === max,
  };
}

/**
 * Grade the "critical" state (e.g. an attribute's temp value hitting rock
 * bottom) — a dedicated color outside the 1-10 gradient entirely, since it
 * represents a distinct in-fiction consequence rather than a low roll.
 * @param {object} [config] defaults to the active config
 * @returns {{bg: string, textColor: string}}
 */
export function colorForCritical(config = activeConfig) {
  const rgb = hexToRgb(config.critical);
  return { bg: rgbToHex(rgb), textColor: textColorFor(rgb) };
}
