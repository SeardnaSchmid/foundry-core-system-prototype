import { buildGearPresentation, buildGearSummary } from './item-presentation.mjs';
import { itemRoles, missingRequired } from './items.mjs';
import { getSkillDefinitions } from './skills.mjs';

/** Add localized display strings to the global-free compact summary. */
export function localizeGearSummary(item) {
  const definitions = getSkillDefinitions(item.actor);
  const summary = buildGearSummary(item);
  const stats = summary.stats.flatMap((stat) => {
    if (Array.isArray(stat.value)) {
      return [{ ...stat, display: stat.value.map((key) => game.i18n.localize(key)).join(', ') }];
    }
    if (stat.value && typeof stat.value === 'object') {
      const definition = definitions[stat.value.skillKey];
      if (!definition) return [];
      return [{ ...stat, display: `${definition.label} ${stat.value.rank}` }];
    }
    return [{ ...stat, display: String(stat.value) }];
  });
  return { badges: summary.badges, stats };
}

/** Build the shared template context used by the popover and chat card. */
export function prepareGearSummaryContext(item) {
  const presentation = buildGearPresentation(item, item.actor);
  presentation.ownership.label = presentation.ownership.state
    ? `TNO.Inventory.${presentation.ownership.state[0].toUpperCase()}${presentation.ownership.state.slice(1)}`
    : null;
  return {
    item,
    roles: itemRoles(item),
    presentation,
    summary: localizeGearSummary(item),
    missingCount: missingRequired(item).length,
  };
}
