import { getSkillDefinitions, generateCustomSkillKey } from '../helpers/skills.mjs';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Add or edit a custom, actor-defined skill. In add mode (no `key` given) a
 * new skill is created under the clicked group's category, starting at rank
 * 0/0 xp; in edit mode (a `key` given) the existing skill's display name,
 * category and suggested attribute are updated in place, leaving its key,
 * rank, XP and lastAttribute untouched so renaming/recategorizing never
 * discards progress.
 * @extends {ApplicationV2}
 */
export class TnoCustomSkillDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {Actor} actor           The actor to add/edit the custom skill on.
   * @param {object} [options]
   * @param {string} [options.key]       Existing custom skill's key. When set, edit mode.
   * @param {string} [options.category]  Category to preselect in add mode.
   */
  constructor(actor, { key = null, category = 'general' } = {}) {
    const existing = key ? actor.system.skills?.[key]?.custom : null;
    super();
    this.draft = {
      name: existing?.label ?? '',
      category: existing?.category ?? category,
      attribute: existing?.attribute ?? 'wil',
    };
    this.actor = actor;
    this.key = key;
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    tag: 'form',
    classes: ['tno', 'sheet'],
    position: { width: 320 },
    // The handler closes the dialog itself, and only once the skill is
    // saved: a missing or duplicate name keeps what was typed.
    form: { handler: TnoCustomSkillDialog.#onSubmit, closeOnSubmit: false },
    actions: { deleteSkill: TnoCustomSkillDialog.#onDelete },
  };

  /** @override */
  static PARTS = {
    body: { template: 'systems/tno/templates/apps/custom-skill-dialog.hbs' },
  };

  /** Whether this dialog is editing an existing custom skill. */
  get isEdit() {
    return !!this.key;
  }

  /** @override */
  get title() {
    return game.i18n.localize(this.isEdit ? 'TNO.CustomSkill.EditTitle' : 'TNO.CustomSkill.AddTitle');
  }

  /**
   * Remove this custom skill entirely, confirming first if it has rank/XP
   * invested so a misclick can't silently discard progress.
   * @this {TnoCustomSkillDialog}
   */
  static async #onDelete() {
    const entry = this.actor.system.skills?.[this.key];
    if (!entry?.custom) return;
    const rank = entry.value ?? 0;
    const xp = entry.xp ?? 0;
    const content = rank > 0 || xp > 0
      ? game.i18n.format('TNO.CustomSkill.DeleteConfirmXp', { name: entry.custom.label, rank, xp })
      : game.i18n.format('TNO.CustomSkill.DeleteConfirm', { name: entry.custom.label });
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize('TNO.CustomSkill.DeleteTitle') },
      content,
    });
    if (!confirmed) return;
    await this.actor.update({ [`system.skills.-=${this.key}`]: null });
    this.close();
  }

  /** @override */
  async _prepareContext() {
    const categories = Object.entries(CONFIG.TNO.skillCategories).map(([key, labelKey]) => ({
      key,
      label: game.i18n.localize(labelKey),
    }));
    const abilities = Object.entries(CONFIG.TNO.abilities).map(([key, labelKey]) => ({
      key,
      label: game.i18n.localize(labelKey),
    }));
    return {
      isEdit: this.isEdit,
      ...this.draft,
      categories,
      abilities,
    };
  }

  /** @this {TnoCustomSkillDialog} */
  static async #onSubmit(event, form, { object: formData }) {
    const label = (formData.name ?? '').trim();
    if (!label) {
      ui.notifications.warn(game.i18n.localize('TNO.CustomSkill.NameRequired'));
      return;
    }

    const definitions = getSkillDefinitions(this.actor);
    const duplicate = Object.entries(definitions).some(
      ([key, def]) => key !== this.key && def.label.toLowerCase() === label.toLowerCase()
    );
    if (duplicate) {
      ui.notifications.warn(game.i18n.localize('TNO.CustomSkill.DuplicateName'));
      return;
    }

    const category = formData.category in CONFIG.TNO.skillCategories ? formData.category : 'general';
    const attribute = formData.attribute in CONFIG.TNO.abilities ? formData.attribute : 'wil';

    if (this.isEdit) {
      await this.actor.update({ [`system.skills.${this.key}.custom`]: { label, category, attribute } });
    } else {
      const key = generateCustomSkillKey(Object.keys(definitions), label);
      await this.actor.update({
        [`system.skills.${key}`]: { value: 0, xp: 0, lastAttribute: '', custom: { label, category, attribute } },
      });
    }
    await this.close();
  }
}
