const SKILL_MIN = 0;
const SKILL_MAX = 10;

/**
 * Placeholder dialog for advancing a skill, opened from the skill list's
 * advance button. It just exposes the skill's rank and accumulated XP as
 * directly editable fields — there's no cost/rule engine here yet, this is
 * a stub for the future advancement system.
 * @extends {FormApplication}
 */
export class JosterSkillAdvanceDialog extends FormApplication {
  /**
   * @param {Actor} actor         The actor whose skill is being advanced.
   * @param {object} options
   * @param {string} options.key    Skill key, e.g. "brawling".
   * @param {string} options.label  Localized skill label, shown in the dialog title.
   * @param {number} [options.rank] Current skill rank.
   * @param {number} [options.xp]   Current XP invested in the skill.
   */
  constructor(actor, { key, label, rank = 0, xp = 0 } = {}) {
    super({ rank, xp });
    this.actor = actor;
    this.key = key;
    this.label = label;
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: 'joster-skill-advance-dialog',
      classes: ['joster', 'sheet'],
      template: 'systems/joster/templates/apps/skill-advance-dialog.hbs',
      width: 280,
      closeOnSubmit: true,
    });
  }

  /** @override */
  get title() {
    return game.i18n.format('JOSTER.SkillAdvanceDialogTitle', { name: this.label });
  }

  /** @override */
  getData() {
    return { ...this.object, label: this.label };
  }

  /** @override */
  async _updateObject(event, formData) {
    const rank = Math.clamp(Number(formData.rank) || 0, SKILL_MIN, SKILL_MAX);
    const xp = Math.max(0, Number(formData.xp) || 0);
    await this.actor.update({
      [`system.skills.${this.key}.value`]: rank,
      [`system.skills.${this.key}.xp`]: xp,
    });
  }
}
