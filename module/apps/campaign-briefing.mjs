import {
  DEFAULT_CAMPAIGN_BRIEFING,
  newBriefingLocation,
  newBriefingSession,
  normalizeCampaignBriefing,
} from '../helpers/campaign-briefing.mjs';

const { FormApplication } = foundry.appv1.api;

/**
 * Player-facing campaign board. It opens after a player connects and is read
 * only there; GMs open the same surface through the settings menu in edit mode.
 */
export class TnoCampaignBriefing extends FormApplication {
  constructor(options = {}) {
    super({});
    this.editable = options.editable === true;
    this.options.id = this.editable ? 'tno-campaign-briefing-editor' : 'tno-campaign-briefing';
    this.options.classes = [
      ...(this.options.classes ?? []),
      this.editable ? 'briefing-editor-app' : 'briefing-viewer-app',
    ];
    this.object = normalizeCampaignBriefing(game.settings.get('tno', 'campaignBriefing'));
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'tno-campaign-briefing',
      classes: ['tno', 'sheet', 'tno-campaign-briefing'],
      template: 'systems/tno/templates/apps/campaign-briefing.hbs',
      width: 1240,
      height: 760,
      resizable: true,
      closeOnSubmit: false,
    });
  }

  get title() {
    return game.i18n.localize('TNO.CampaignBriefing.WindowTitle');
  }

  getData() {
    const locations = this.editable
      ? this.object.locations
      : this.object.locations.filter((location) => location.name);
    const authoredSessions = this.editable
      ? this.object.sessions
      : this.object.sessions.filter((session) => session.title || session.summary);
    const sessions = this.editable ? authoredSessions : [...authoredSessions].reverse();
    const currentLocation = locations.find((location) => location.current);
    return {
      ...this.object,
      locations,
      sessions,
      editable: this.editable && game.user.isGM,
      isGM: game.user.isGM,
      hasLocations: locations.length > 0,
      hasSessions: sessions.length > 0,
      sessionCount: sessions.length,
      currentLocation,
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    html.find('[data-action="close-briefing"]').on('click', (event) => {
      event.preventDefault();
      this.close();
    });
    if (!this.editable || !game.user.isGM) return;

    html.find('[data-action="preview"]').on('click', (event) => {
      event.preventDefault();
      this._captureForm(html);
      const preview = new TnoCampaignBriefing();
      preview.object = normalizeCampaignBriefing(this.object);
      preview.render(true);
    });
    html.find('[data-action="add-location"]').on('click', (event) => {
      event.preventDefault();
      this._captureForm(html);
      this.object.locations.push(newBriefingLocation());
      this.render();
    });
    html.find('[data-action="remove-location"]').on('click', (event) => {
      event.preventDefault();
      this._captureForm(html);
      this.object.locations.splice(Number(event.currentTarget.dataset.index), 1);
      this.render();
    });
    html.find('[data-action="add-session"]').on('click', (event) => {
      event.preventDefault();
      this._captureForm(html);
      this.object.sessions.push(newBriefingSession());
      this.render();
    });
    html.find('[data-action="remove-session"]').on('click', (event) => {
      event.preventDefault();
      this._captureForm(html);
      this.object.sessions.splice(Number(event.currentTarget.dataset.index), 1);
      this.render();
    });
  }

  /** Read the visible editor without relying on FormApplication's flat fields. */
  _captureForm(html) {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    const read = (name) => root.querySelector(`[data-briefing-field="${name}"]`)?.value ?? '';
    this.object.enabled = root.querySelector('[data-briefing-field="enabled"]')?.checked === true;
    this.object.title = read('title');
    this.object.subtitle = read('subtitle');
    this.object.starName = read('starName');
    this.object.locations = this.object.locations.map((_, index) => ({
      name: read(`location.${index}.name`),
      type: read(`location.${index}.type`),
      distance: read(`location.${index}.distance`),
      x: read(`location.${index}.x`),
      y: read(`location.${index}.y`),
      current: root.querySelector(`[data-briefing-field="location.${index}.current"]`)?.checked === true,
    }));
    this.object.sessions = this.object.sessions.map((_, index) => ({
      label: read(`session.${index}.label`),
      title: read(`session.${index}.title`),
      summary: read(`session.${index}.summary`),
    }));
    this.object = normalizeCampaignBriefing(this.object);
  }

  async _updateObject(_event, _formData) {
    if (!this.editable || !game.user.isGM) return;
    this._captureForm(this.element);
    await game.settings.set('tno', 'campaignBriefing', this.object);
    ui.notifications.info(game.i18n.localize('TNO.CampaignBriefing.Saved'));
    this.render();
  }
}

/** The settings menu always opens the editable GM variant. */
export class TnoCampaignBriefingEditor extends TnoCampaignBriefing {
  constructor() {
    super({ editable: true });
  }
}

/** Open a player-safe, read-only copy from a macro or another module. */
export const openCampaignBriefing = () => new TnoCampaignBriefing().render(true);

export { DEFAULT_CAMPAIGN_BRIEFING };
