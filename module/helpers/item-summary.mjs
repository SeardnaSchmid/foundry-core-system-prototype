import { buildGearPresentation, buildGearSummary } from './item-presentation.mjs';
import { MISSING_FIELD_LABELS, itemRoles, missingRequired } from './items.mjs';
import { getSkillDefinitions } from './skills.mjs';

/**
 * Add localized display strings to the global-free compact summary.
 *
 * Every value the card shows is finished here, so the templates hold no
 * formatting decisions: the header's type line and slot count, a tile that is
 * `na` or `missing`, and the two structured values — the weapon attribute's key
 * and the FV's skill — resolved against the owning actor. An FV whose skill no
 * longer exists on that actor reads as missing rather than as a raw key.
 *
 * @param {Item} item
 * @returns {{subtitle: string, probe: ?Object, tiles: Array, rows: Array, missing: string[]}}
 */
export function localizeGearSummary(item) {
  const definitions = getSkillDefinitions(item.actor);
  const summary = buildGearSummary(item);
  const loc = (key) => game.i18n.localize(key);
  const absent = () => loc('TNO.Item.Summary.Missing');

  // "Waffe / Nahkampf · 4 Slots": what it is, then what it costs to carry. A
  // stack's size joins the line for the roles whose card has no stock row.
  const { roleKey, detailKey } = summary.typeLine;
  const kind = detailKey
    ? game.i18n.format('TNO.Item.Summary.Kind', { role: loc(roleKey), detail: loc(detailKey) })
    : loc(roleKey);
  const subtitle = [
    kind,
    game.i18n.format(summary.slots === 1 ? 'TNO.Item.Summary.SlotOne' : 'TNO.Item.Summary.SlotMany', { count: summary.slots }),
    ...(summary.quantity > 1 && !itemRoles(item).consumable ? [`×${summary.quantity}`] : []),
  ].join(' · ');

  let probe = null;
  if (summary.probe) {
    const definition = definitions[summary.probe.skill.skillKey];
    probe = {
      attribute: {
        labelKey: summary.probe.attribute.labelKey,
        display: summary.probe.attribute.valueKey ? loc(summary.probe.attribute.valueKey) : absent(),
        missing: !summary.probe.attribute.valueKey,
      },
      skill: {
        labelKey: summary.probe.skill.labelKey,
        display: definition ? definition.label : absent(),
        missing: !definition,
      },
    };
  }

  // Quarter-step values want the reader's own decimal separator — the
  // Rüstungen table writes 0,25 in German. Whole numbers come out unchanged.
  const decimal = new Intl.NumberFormat(game.i18n.lang, { maximumFractionDigits: 2 });

  const tiles = summary.tiles.map((tile) => ({
    ...tile,
    display: tile.state === 'value' ? (tile.decimal ? decimal.format(tile.value) : tile.value) : '–',
    title: tile.state === 'missing'
      ? game.i18n.format('TNO.Item.Summary.TileMissing', { label: loc(tile.titleKey) })
      : loc(tile.titleKey),
  }));

  const rows = summary.rows.map((row) => ({
    ...row,
    display: `${row.prefixKey ? `${loc(row.prefixKey)} ` : ''}${row.value}`,
    note: row.note
      ? { state: row.note.state, text: game.i18n.format(row.note.labelKey, row.note.params ?? {}) }
      : null,
  }));

  return { subtitle, probe, tiles, rows, missing: summary.missing };
}

/**
 * Build the shared template context used by the popover and chat card.
 *
 * Async because the description is enriched HTML.
 */
export async function prepareGearSummaryContext(item) {
  const presentation = buildGearPresentation(item, item.actor);
  presentation.ownership.label = presentation.ownership.state
    ? `TNO.Inventory.${presentation.ownership.state[0].toUpperCase()}${presentation.ownership.state.slice(1)}`
    : null;
  const roles = itemRoles(item);
  const plain = !roles.weapon && !roles.armor && !roles.consumable;
  const missing = missingRequired(item);
  return {
    item,
    roles,
    plain,
    presentation,
    summary: localizeGearSummary(item),
    stock: Math.max(0, Number(item.system.quantity) || 0),
    description: item.system.description
      ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description, {
          secrets: item.isOwner,
          relativeTo: item,
        })
      : '',
    missingCount: missing.length,
    // Named rather than counted: the card is read instead of the editor, so
    // "RA is missing" is the useful sentence and "3 fields open" is not.
    missingFields: missing
      .map((field) => game.i18n.localize(MISSING_FIELD_LABELS[field] ?? field))
      .join(', '),
  };
}
