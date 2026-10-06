import { RANK_MAX, nextRankXpCost, xpProgress } from '../helpers/advancement.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const SKILL_MIN = 0;
const ATTRIBUTE_MIN = 1;

/**
 * Advancement dialog for a single attribute or skill, opened from the sheet.
 *
 * It shows the current rank, the XP accumulated toward the next rank and the
 * cost of that next rank, and offers three guided actions — spend/refund a
 * single XP and "buy" the next rank — plus an always-open correction panel
 * with directly editable rank/XP fields for fixing mistakes.
 * There is no free XP pool: XP only ever exist on their attribute or skill
 * (wiki: *Charakterentwicklung*). Buying a rank consumes that rank's cost and
 * any surplus carries over toward the next rank. The costs come from
 * `helpers/advancement.mjs`.
 *
 * @extends {ApplicationV2}
 */
export class TnoAdvanceDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {Actor} actor         The actor being advanced.
   * @param {object} options
   * @param {"attribute"|"skill"} options.type  What's being advanced.
   * @param {string} options.key    Attribute or skill key, e.g. "str" / "brawling".
   * @param {string} options.label  Localized label, shown in the dialog title.
   * @param {number} [options.rank] Current rank.
   * @param {number} [options.xp]   Current XP invested toward the next rank.
   */
  constructor(actor, { type, key, label, rank = 0, xp = 0 } = {}) {
    super();
    this.draft = { rank, xp };
    this.actor = actor;
    this.type = type;
    this.key = key;
    this.label = label;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    tag: 'form',
    classes: ['tno', 'sheet'],
    // Room for the correction row: two stepped fields and Übernehmen.
    position: { width: 400 },
    // The correction stays in the dialog: it closes the correction panel
    // and shows the corrected progress (see #onSubmit).
    form: { handler: TnoAdvanceDialog.#onSubmit, closeOnSubmit: false },
    actions: {
      xpInc: TnoAdvanceDialog.#onGuided,
      xpDec: TnoAdvanceDialog.#onGuided,
      buy: TnoAdvanceDialog.#onGuided,
      step: TnoAdvanceDialog.#onStep,
    },
  };

  /** @override */
  static PARTS = {
    body: { template: 'systems/tno/templates/apps/advance-dialog.hbs' },
  };

  /** @override */
  get title() {
    return game.i18n.format('TNO.SkillAdvanceDialogTitle', { name: this.label });
  }

  /** Lowest allowed rank for this type (skills can hit 0, attributes floor at 1). */
  get _rankMin() {
    return this.type === 'attribute' ? ATTRIBUTE_MIN : SKILL_MIN;
  }

  /** @override */
  async _prepareContext() {
    const { rank, xp } = this.draft;
    const { xpCost: cost, xpAtMax: atMax, xpReady, xpPercent } = xpProgress(this.type, rank, xp);
    return {
      label: this.label,
      rank,
      xp,
      cost,
      nextRank: rank + 1,
      atMax,
      canBuy: xpReady,
      canDecXp: xp > 0,
      remaining: Math.max(0, cost - xp),
      rankMin: this._rankMin,
      percent: xpPercent,
    };
  }

  /**
   * The guided actions: spend or take back XP (Shift: five), or buy the next
   * rank. They apply immediately — persisted before re-rendering so closing
   * the dialog never silently drops them.
   * @this {TnoAdvanceDialog}
   */
  static async #onGuided(event, target) {
    // Fold any manual edits to the rank/XP fields back into working draft
    // first, so guided actions build on what the user just typed.
    this._syncFromForm();
    const step = event.shiftKey ? 5 : 1;
    const action = target.dataset.action;
    if (action === 'xpInc') {
      this.draft.xp += step;
    } else if (action === 'xpDec') {
      this.draft.xp = Math.max(0, this.draft.xp - step);
    } else if (action === 'buy') {
      const cost = nextRankXpCost(this.type, this.draft.rank);
      if (this.draft.rank < RANK_MAX && this.draft.xp >= cost) {
        this.draft.rank += 1;
        // Only the rank's cost is consumed; any surplus XP carries over
        // toward the next rank.
        this.draft.xp -= cost;
      }
    }
    await this._persist();
    this.render();
  }

  /**
   * The correction steppers only change their field, within its min/max;
   * Übernehmen saves. Shift steps by 5 like the XP stepper.
   * @this {TnoAdvanceDialog}
   */
  static #onStep(event, target) {
    const input = this.element.querySelector(`[name="${target.dataset.field}"]`);
    if (!input) return;
    const n = event.shiftKey ? 5 : 1;
    if (Number(target.dataset.delta) > 0) input.stepUp(n);
    else input.stepDown(n);
  }

  /**
   * Read the editable rank/XP fields into the working draft, clamped to their
   * valid ranges, so guided-action buttons operate on manual corrections too.
   * @private
   */
  _syncFromForm() {
    const rankEl = this.element.querySelector('[name="rank"]');
    const xpEl = this.element.querySelector('[name="xp"]');
    if (rankEl) this.draft.rank = Math.clamp(Math.round(Number(rankEl.value) || 0), this._rankMin, RANK_MAX);
    if (xpEl) this.draft.xp = Math.max(0, Math.round(Number(xpEl.value) || 0));
  }

  /**
   * Write the working rank/XP to the actor. Shared by the immediate guided
   * actions and the manual-correction save.
   * @private
   */
  async _persist() {
    const { rank, xp } = this.draft;
    if (this.type === 'attribute') {
      await this.actor.update({
        [`system.abilities.${this.key}.base`]: rank,
        [`system.abilities.${this.key}.xp`]: xp,
      });
    } else {
      await this.actor.update({
        [`system.skills.${this.key}.value`]: rank,
        [`system.skills.${this.key}.xp`]: xp,
      });
    }
  }

  /**
   * Übernehmen: save the corrected rank/XP. Out-of-range fields are reported
   * with the browser's own min/max message instead of silently clamped.
   * @this {TnoAdvanceDialog}
   */
  static async #onSubmit(event, form, { object: formData }) {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    this.draft.rank = Math.clamp(Math.round(Number(formData.rank) || 0), this._rankMin, RANK_MAX);
    this.draft.xp = Math.max(0, Math.round(Number(formData.xp) || 0));
    await this._persist();
    this.render();
  }
}
