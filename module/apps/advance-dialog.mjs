const SKILL_MIN = 0;
const ATTRIBUTE_MIN = 1;
const RANK_MAX = 10;

/**
 * Advancement dialog for a single attribute or skill, opened from the sheet.
 *
 * It shows the current rank, the XP accumulated toward the next rank and the
 * cost of that next rank, and offers three guided actions — spend/refund a
 * single XP and "buy" the next rank — plus directly editable rank/XP fields
 * for correcting mistakes. Per the "Charakterentwicklung" rules, XP always
 * belong to exactly one attribute or skill; buying a rank consumes that rank's
 * cost and any surplus carries over toward the next rank.
 *
 * The XP cost to advance *to* rank N is 3*N for skills and N*N for attributes
 * (matching the level cost table); this dialog only ever deals with the single
 * next step, not the cumulative total.
 *
 * @extends {FormApplication}
 */
export class TnoAdvanceDialog extends FormApplication {
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
    super({ rank, xp });
    this.actor = actor;
    this.type = type;
    this.key = key;
    this.label = label;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'tno-advance-dialog',
      classes: ['tno', 'sheet'],
      template: 'systems/tno/templates/apps/advance-dialog.hbs',
      width: 300,
      closeOnSubmit: true,
    });
  }

  /** @override */
  get title() {
    return game.i18n.format('TNO.SkillAdvanceDialogTitle', { name: this.label });
  }

  /** Lowest allowed rank for this type (skills can hit 0, attributes floor at 1). */
  get _rankMin() {
    return this.type === 'attribute' ? ATTRIBUTE_MIN : SKILL_MIN;
  }

  /**
   * Marginal XP cost to advance from `rank` to `rank + 1`.
   * @param {number} rank
   * @returns {number}
   */
  _nextRankCost(rank) {
    return this.type === 'attribute' ? (rank + 1) ** 2 : 3 * (rank + 1);
  }

  /** @override */
  getData() {
    const rank = this.object.rank;
    const xp = this.object.xp;
    const cost = this._nextRankCost(rank);
    const atMax = rank >= RANK_MAX;
    return {
      label: this.label,
      rank,
      xp,
      cost,
      nextRank: rank + 1,
      atMax,
      canBuy: !atMax && xp >= cost,
      canDecXp: xp > 0,
      remaining: Math.max(0, cost - xp),
      rankMin: this._rankMin,
      percent: atMax ? 100 : Math.min(100, Math.round((xp / cost) * 100)),
    };
  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    html.find('[data-action]').on('click', async (ev) => {
      ev.preventDefault();
      // Fold any manual edits to the rank/XP fields back into working state
      // first, so guided actions build on what the user just typed.
      this._syncFromForm(html);
      const action = ev.currentTarget.dataset.action;
      const step = ev.shiftKey ? 5 : 1;

      if (action === 'xp-inc') {
        this.object.xp += step;
      } else if (action === 'xp-dec') {
        this.object.xp = Math.max(0, this.object.xp - step);
      } else if (action === 'buy') {
        const cost = this._nextRankCost(this.object.rank);
        if (this.object.rank < RANK_MAX && this.object.xp >= cost) {
          this.object.rank += 1;
          // Only the rank's cost is consumed; any surplus XP carries over
          // toward the next rank.
          this.object.xp -= cost;
        }
      }
      // Guided actions apply immediately — persist before re-rendering so
      // closing the dialog never silently drops them.
      await this._persist();
      this.render();
    });

    // Native <details> grows the content but not the Foundry window frame, so
    // recompute the auto height when the correction block opens/closes.
    html.find('.advance-correction').on('toggle', () => this.setPosition({ height: 'auto' }));

    // Surface native min/max validation on the correction fields instead of
    // silently clamping on save (see _updateObject).
    const form = html[0];
    form?.addEventListener(
      'submit',
      (ev) => {
        if (!form.checkValidity()) {
          ev.preventDefault();
          ev.stopPropagation();
          form.reportValidity();
        }
      },
      true,
    );
  }

  /**
   * Read the editable rank/XP fields into the working object, clamped to their
   * valid ranges, so guided-action buttons operate on manual corrections too.
   * @param {JQuery} html
   * @private
   */
  _syncFromForm(html) {
    const rankEl = html.find('[name="rank"]')[0];
    const xpEl = html.find('[name="xp"]')[0];
    if (rankEl) this.object.rank = Math.clamp(Math.round(Number(rankEl.value) || 0), this._rankMin, RANK_MAX);
    if (xpEl) this.object.xp = Math.max(0, Math.round(Number(xpEl.value) || 0));
  }

  /**
   * Write the working rank/XP to the actor. Shared by the immediate guided
   * actions and the manual-correction save.
   * @private
   */
  async _persist() {
    const { rank, xp } = this.object;
    if (this.type === 'attribute') {
      // Advancement raises the trained base value; the current (temp) value is
      // refreshed to match, mirroring the base stepper on the sheet.
      await this.actor.update({
        [`system.abilities.${this.key}.base`]: rank,
        [`system.abilities.${this.key}.value`]: rank,
        [`system.abilities.${this.key}.xp`]: xp,
      });
    } else {
      await this.actor.update({
        [`system.skills.${this.key}.value`]: rank,
        [`system.skills.${this.key}.xp`]: xp,
      });
    }
  }

  /** @override */
  async _updateObject(event, formData) {
    this.object.rank = Math.clamp(Math.round(Number(formData.rank) || 0), this._rankMin, RANK_MAX);
    this.object.xp = Math.max(0, Math.round(Number(formData.xp) || 0));
    await this._persist();
  }
}
