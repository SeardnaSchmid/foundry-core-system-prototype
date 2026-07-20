import {
  colorForValue,
  colorForCritical,
  getActiveHeatmapConfig,
  setActiveHeatmapConfig,
  HEATMAP_QUICK_PRESETS,
  MID_VALUE_MIN,
  MID_VALUE_MAX,
  CURVE_MIN,
  CURVE_MAX,
} from '../helpers/heatmap.mjs';

const PREVIEW_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const CONFIG_FIELDS = ['low', 'mid', 'high', 'midValue', 'lowCurve', 'highCurve', 'critical'];

/**
 * Live editor for the attribute heatmap's gradient:
 *  - three color stops (low/mid/high)
 *  - the attribute value at which the middle stop sits (midValue) — moving
 *    it shifts how much of the 1-10 range each side of the gradient covers
 *  - an independent curve per segment (lowCurve/highCurve) for banding
 *  - a dedicated "critical" color for the attribute's rock-bottom state
 *
 * Dragging any control updates the in-dialog preview immediately (a cheap
 * direct DOM write, no re-render, so a drag isn't interrupted); releasing it
 * (the "change" event) persists the config and re-renders every open actor
 * sheet, so the real cells are never more than one release behind what's
 * shown here.
 *
 * @extends {FormApplication}
 */
export class TnoHeatmapLab extends FormApplication {
  constructor() {
    super({ ...getActiveHeatmapConfig() });
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'tno-heatmap-lab',
      classes: ['tno', 'sheet', 'tno-heatmap-lab'],
      template: 'systems/tno/templates/apps/heatmap-lab.hbs',
      width: 340,
      height: 'auto',
      closeOnSubmit: false,
      submitOnChange: true,
    });
  }

  /** @override */
  get title() {
    return game.i18n.localize('TNO.Settings.HeatmapPreset.Name');
  }

  /** @override */
  getData() {
    const criticalColor = colorForCritical(this.object);
    return {
      ...this.object,
      midValueMin: MID_VALUE_MIN,
      midValueMax: MID_VALUE_MAX,
      curveMin: CURVE_MIN,
      curveMax: CURVE_MAX,
      presets: Object.entries(HEATMAP_QUICK_PRESETS).map(([id, preset]) => ({
        id,
        label: game.i18n.localize(preset.label),
      })),
      preview: PREVIEW_VALUES.map((value) => {
        const dc = colorForValue(value, 1, 10, this.object);
        return { value, bg: dc.bg, textColor: dc.textColor };
      }),
      criticalPreview: { bg: criticalColor.bg, textColor: criticalColor.textColor },
    };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Continuous drag feedback: recompute the preview swatches straight from
    // the live form values on every "input" tick, without touching the
    // shared active config or triggering a re-render (which would cut the
    // drag short on a range slider).
    html.on('input', 'input[name]', () => this._refreshPreview(html));

    html.find('[data-action="load-preset"]').on('click', (ev) => {
      ev.preventDefault();
      const preset = HEATMAP_QUICK_PRESETS[ev.currentTarget.dataset.preset];
      if (!preset) return;
      this.object = Object.fromEntries(CONFIG_FIELDS.map((field) => [field, preset[field]]));
      this._apply();
    });
  }

  /**
   * Read the form's current (uncommitted) values and repaint the preview
   * swatches to match, so dragging a stop or a slider gives instant
   * feedback before the change is persisted.
   * @param {JQuery} html
   * @private
   */
  _refreshPreview(html) {
    const config = this._readForm(html);
    html.find('.heatmap-lab-midpoint-value').text(config.midValue.toFixed(1));
    html.find('.heatmap-lab-lowcurve-value').text(config.lowCurve.toFixed(1));
    html.find('.heatmap-lab-highcurve-value').text(config.highCurve.toFixed(1));
    html.find('.heatmap-lab-swatch').each((_, el) => {
      const dc = colorForValue(Number(el.dataset.value), 1, 10, config);
      el.style.background = dc.bg;
      el.style.color = dc.textColor;
    });
    const cc = colorForCritical(config);
    html.find('.heatmap-lab-critical-swatch').css({ background: cc.bg, color: cc.textColor });
  }

  /**
   * @param {JQuery} html
   * @returns {object}
   * @private
   */
  _readForm(html) {
    return {
      low: html.find('[name="low"]').val(),
      mid: html.find('[name="mid"]').val(),
      high: html.find('[name="high"]').val(),
      midValue: Number(html.find('[name="midValue"]').val()) || 4.5,
      lowCurve: Number(html.find('[name="lowCurve"]').val()) || 1,
      highCurve: Number(html.find('[name="highCurve"]').val()) || 1,
      critical: html.find('[name="critical"]').val(),
    };
  }

  /** @override */
  async _updateObject(event, formData) {
    this.object = {
      low: formData.low,
      mid: formData.mid,
      high: formData.high,
      midValue: Number(formData.midValue) || 4.5,
      lowCurve: Number(formData.lowCurve) || 1,
      highCurve: Number(formData.highCurve) || 1,
      critical: formData.critical,
    };
    await this._apply();
  }

  /**
   * Persist the current object as the active gradient config, apply it
   * everywhere (this dialog's preview + every open actor sheet), and save
   * it to the client so it survives a reload.
   * @private
   */
  async _apply() {
    setActiveHeatmapConfig(this.object);
    await Promise.all([
      game.settings.set('tno', 'heatmapLow', this.object.low),
      game.settings.set('tno', 'heatmapMid', this.object.mid),
      game.settings.set('tno', 'heatmapHigh', this.object.high),
      game.settings.set('tno', 'heatmapMidValue', this.object.midValue),
      game.settings.set('tno', 'heatmapLowCurve', this.object.lowCurve),
      game.settings.set('tno', 'heatmapHighCurve', this.object.highCurve),
      game.settings.set('tno', 'heatmapCritical', this.object.critical),
    ]);
    Object.values(ui.windows).forEach((w) => {
      if (w !== this) w.render?.(false);
    });
    this.render();
  }
}
