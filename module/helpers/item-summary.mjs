import { buildGearPresentation, buildGearSummary } from './item-presentation.mjs';
import { MISSING_FIELD_LABELS, itemRoles, missingRequired } from './items.mjs';
import { getSkillDefinitions } from './skills.mjs';

/**
 * Add localized display strings to the global-free compact summary.
 *
 * Every value the card shows is finished here, so the templates hold no
 * formatting decisions: a tile that is `na` or `missing` says so in words, and
 * the two structured values — the weapon attribute's key and the FV's skill —
 * are resolved against the owning actor. An FV whose skill no longer exists on
 * that actor reads as missing rather than as a raw key.
 *
 * @param {Item} item
 * @returns {{badges: Array, probe: ?Object, tiles: Array, rows: Array, missing: string[]}}
 */
export function localizeGearSummary(item) {
  const definitions = getSkillDefinitions(item.actor);
  const summary = buildGearSummary(item);
  const loc = (key) => game.i18n.localize(key);
  const absent = () => loc('TNO.Item.Summary.Missing');

  const badges = summary.badges.map((badge) => ({
    ...badge,
    text: badge.labelKeys.map(loc).join(badge.join),
  }));

  let probe = null;
  if (summary.probe) {
    const definition = definitions[summary.probe.fv.value?.skillKey];
    probe = {
      attribute: {
        labelKey: summary.probe.attribute.labelKey,
        display: summary.probe.attribute.valueKey ? loc(summary.probe.attribute.valueKey) : absent(),
        missing: !summary.probe.attribute.valueKey,
      },
      fv: {
        labelKey: summary.probe.fv.labelKey,
        display: definition ? `${definition.label}: ${summary.probe.fv.value.rank}` : absent(),
        missing: !definition,
      },
    };
  }

  const tiles = summary.tiles.map((tile) => ({
    ...tile,
    display: tile.state === 'missing' ? absent()
      : tile.state === 'na' ? loc('TNO.Item.Summary.Na')
        : tile.value,
  }));

  const rows = summary.rows.map((row) => ({
    ...row,
    display: row.parts
      ? row.parts.map((part) => `${loc(part.labelKey)} ${part.value}`).join(' · ')
      : `${row.value}${row.suffix ? ` ${row.suffix}` : ''}`,
    note: row.note
      ? { state: row.note.state, text: game.i18n.format(row.note.labelKey, row.note.params ?? {}) }
      : null,
  }));

  return { badges, probe, tiles, rows, missing: summary.missing };
}

/** Build the shared template context used by the popover and chat card. */
export function prepareGearSummaryContext(item) {
  const presentation = buildGearPresentation(item, item.actor);
  presentation.ownership.label = presentation.ownership.state
    ? `TNO.Inventory.${presentation.ownership.state[0].toUpperCase()}${presentation.ownership.state.slice(1)}`
    : null;
  const missing = missingRequired(item);
  return {
    item,
    roles: itemRoles(item),
    presentation,
    summary: localizeGearSummary(item),
    missingCount: missing.length,
    // Named rather than counted: the card is read instead of the editor, so
    // "RA is missing" is the useful sentence and "3 fields open" is not.
    missingFields: missing
      .map((field) => game.i18n.localize(MISSING_FIELD_LABELS[field] ?? field))
      .join(' · '),
  };
}
