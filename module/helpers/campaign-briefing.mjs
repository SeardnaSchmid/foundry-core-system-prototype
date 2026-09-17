/**
 * Campaign briefing data is world presentation, not rules data.  Keep its
 * normalisation independent of Foundry so both the editor and the join view
 * agree on what a safe, complete briefing looks like.
 */
export const DEFAULT_CAMPAIGN_BRIEFING = Object.freeze({
  enabled: false,
  title: '',
  subtitle: '',
  starName: 'Sol',
  locations: [],
  sessions: [],
});

const text = (value) => typeof value === 'string' ? value.trim() : '';
const number = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : fallback;
};

/** @param {unknown} value @returns {object} */
export function normalizeCampaignBriefing(value) {
  const source = value && typeof value === 'object' ? value : {};
  const locations = Array.isArray(source.locations) ? source.locations : [];
  const sessions = Array.isArray(source.sessions) ? source.sessions : [];

  let hasCurrentLocation = false;
  return {
    enabled: source.enabled === true,
    title: text(source.title),
    subtitle: text(source.subtitle),
    starName: text(source.starName) || DEFAULT_CAMPAIGN_BRIEFING.starName,
    // Retain blank editor rows so adding a second row cannot silently remove
    // an unfinished first one. The player view filters them below.
    locations: locations.map((location, index) => {
      const current = location?.current === true && !hasCurrentLocation;
      if (current) hasCurrentLocation = true;
      return {
        name: text(location?.name),
        type: text(location?.type),
        distance: text(location?.distance),
        x: number(location?.x, 50 + (index % 3 - 1) * 22),
        y: number(location?.y, 50 + (Math.floor(index / 3) % 3 - 1) * 20),
        current,
      };
    }),
    sessions: sessions.map((session) => ({
      label: text(session?.label),
      title: text(session?.title),
      summary: text(session?.summary),
    })),
  };
}

export const newBriefingLocation = () => ({
  name: '', type: '', distance: '', x: 50, y: 50, current: false,
});

export const newBriefingSession = () => ({ label: '', title: '', summary: '' });
