import { describe, expect, it } from 'vitest';
import { normalizeCampaignBriefing } from '../../module/helpers/campaign-briefing.mjs';

describe('normalizeCampaignBriefing', () => {
  it('keeps editor rows, enforces one current location, and clamps map positions', () => {
    expect(normalizeCampaignBriefing({
      enabled: true,
      title: '  Beyond Neptune  ',
      locations: [
        { name: 'Nior', x: 120, y: -4, current: true },
        { name: '   ', x: 5, y: 5, current: true },
      ],
      sessions: [
        { label: ' Session 10 ', title: ' Arrival ', summary: '  The crew landed.  ' },
        { label: 'Empty' },
      ],
    })).toEqual({
      enabled: true,
      title: 'Beyond Neptune',
      subtitle: '',
      starName: 'Sol',
      locations: [
        { name: 'Nior', type: '', distance: '', x: 100, y: 0, current: true },
        { name: '', type: '', distance: '', x: 5, y: 5, current: false },
      ],
      sessions: [
        { label: 'Session 10', title: 'Arrival', summary: 'The crew landed.' },
        { label: 'Empty', title: '', summary: '' },
      ],
    });
  });

  it('supplies a usable star and empty lists for malformed stored data', () => {
    expect(normalizeCampaignBriefing({ starName: '', locations: {}, sessions: null })).toEqual({
      enabled: false,
      title: '',
      subtitle: '',
      starName: 'Sol',
      locations: [],
      sessions: [],
    });
  });
});
