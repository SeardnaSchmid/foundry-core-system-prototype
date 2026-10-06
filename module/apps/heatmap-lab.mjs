import {
  colorForValue,
  getActiveHeatmapConfig,
  setActiveHeatmapConfig,
  HEATMAP_QUICK_PRESETS,
  MID_VALUE_MIN,
  MID_VALUE_MAX,
  CURVE_MIN,
  CURVE_MAX,
} from '../helpers/heatmap.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const PREVIEW_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const CONFIG_FIELDS = ['low', 'mid', 'high', 'midValue', 'lowCurve', 'highCurve'];

/**
 * Live editor for the attribute heatmap's gradient:
 *  - three color stops (low/mid/high)
 *  - the attribute value at which the middle stop sits (midValue) — moving
 *    it shifts how much of the 1-10 range each side of the gradient covers
 *  - an independent curve per segment (lowCurve/highCurve) for banding
 *
 * Dragging any control updates the in-dialog preview immediately (a cheap
 * direct DOM write, no re-render, so a drag isn't interrupted); releasing it
 * (the "change" event) persists the config and re-renders every open actor
 * sheet, so the real cells are never more than one release behind what's
 * shown here.
 *
 * @extends {ApplicationV2}
 */
export class TnoHeatmapLab extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options) {
    super(options);
    this.config = { ...getActiveHeatmapConfig() };
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    id: 'tno-heatmap-lab',
    tag: 'form',
    classes: ['tno', 'sheet', 'tno-heatmap-lab'],
    window: { title: 'TNO.Settings.HeatmapPreset.Name' },
    position: { width: 340 },
    form: { handler: TnoHeatmapLab.#onSubmit, submitOnChange: true, closeOnSubmit: false },
    actions: { loadPreset: TnoHeatmapLab.#onLoadPreset },
  };

  /** @override */
  static PARTS = {
    body: { template: 'systems/tno/templates/apps/heatmap-lab.hbs' },
  };

  /** @override */
  async _prepareContext() {
    return {
      ...this.config,
      midValueMin: MID_VALUE_MIN,
      midValueMax: MID_VALUE_MAX,
      curveMin: CURVE_MIN,
      curveMax: CURVE_MAX,
      presets: Object.entries(HEATMAP_QUICK_PRESETS).map(([id, preset]) => ({
        id,
        label: game.i18n.localize(preset.label),
      })),
      preview: PREVIEW_VALUES.map((value) => {
        const dc = colorForValue(value, 1, 10, this.config);
        return { value, bg: dc.bg, textColor: dc.textColor };
      }),
    };
  }

  /** @override */
  _onFirstRender(context, options) {
    super._onFirstRender(context, options);
    // Bound once: the <form> root outlives every re-render.
    // Continuous drag feedback: recompute the preview swatches straight from
    // the live form values on every "input" tick, without touching the
    // shared active config or triggering a re-render (which would cut the
    // drag short on a range slider).
    this.element.addEventListener('input', () => this.#refreshPreview());
  }

  /**
   * Read the form's current (uncommitted) values and repaint the preview
   * swatches to match, so dragging a stop or a slider gives instant
   * feedback before the change is persisted.
   */
  #refreshPreview() {
    const config = TnoHeatmapLab.#read(new foundry.applications.ux.FormDataExtended(this.element).object);
    const root = this.element;
    root.querySelector('.heatmap-lab-midpoint-value').textContent = config.midValue.toFixed(1);
    root.querySelector('.heatmap-lab-lowcurve-value').textContent = config.lowCurve.toFixed(1);
    root.querySelector('.heatmap-lab-highcurve-value').textContent = config.highCurve.toFixed(1);
    for (const el of root.querySelectorAll('.heatmap-lab-swatch')) {
      const dc = colorForValue(Number(el.dataset.value), 1, 10, config);
      el.style.background = dc.bg;
      el.style.color = dc.textColor;
    }
  }

  /** The gradient config out of the form's values. */
  static #read(data) {
    return {
      low: data.low,
      mid: data.mid,
      high: data.high,
      midValue: Number(data.midValue) || 4.5,
      lowCurve: Number(data.lowCurve) || 1,
      highCurve: Number(data.highCurve) || 1,
    };
  }

  /** @this {TnoHeatmapLab} */
  static async #onSubmit(event, form, formData) {
    this.config = TnoHeatmapLab.#read(formData.object);
    await this.#apply();
  }

  /** @this {TnoHeatmapLab} */
  static async #onLoadPreset(event, target) {
    const preset = HEATMAP_QUICK_PRESETS[target.dataset.preset];
    if (!preset) return;
    this.config = Object.fromEntries(CONFIG_FIELDS.map((field) => [field, preset[field]]));
    await this.#apply();
  }

  /**
   * Persist the current config as the active gradient, apply it everywhere
   * (this dialog's preview + every open actor sheet), and save it to the
   * client so it survives a reload.
   */
  async #apply() {
    setActiveHeatmapConfig(this.config);
    await Promise.all([
      game.settings.set('tno', 'heatmapLow', this.config.low),
      game.settings.set('tno', 'heatmapMid', this.config.mid),
      game.settings.set('tno', 'heatmapHigh', this.config.high),
      game.settings.set('tno', 'heatmapMidValue', this.config.midValue),
      game.settings.set('tno', 'heatmapLowCurve', this.config.lowCurve),
      game.settings.set('tno', 'heatmapHighCurve', this.config.highCurve),
    ]);
    // The actor sheets are ApplicationV2 and so not in `ui.windows`.
    for (const app of foundry.applications.instances.values()) {
      if (app.document?.documentName === 'Actor' && app.rendered) app.render();
    }
    this.render();
  }
}
