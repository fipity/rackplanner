import { describe, expect, it } from 'vitest';
import { RegionSchema } from '@rackplanner/shared';
import { blankRegion, draftToRegion, regionToDraft } from './regionDraft';

describe('faceplate editor region drafts', () => {
  it('round-trips a region, keeping fields the table does not edit', () => {
    const r = RegionSchema.parse({ type: 'rj45', count: 8, poe: 'poe+', poePorts: [1, 2, 3, 4], grouping: 8, portType: 'rj45_1g', x: 0.06, w: 0.9, y: 0.2, h: 0.68 });
    const d = regionToDraft(r);
    expect(d.x).toBe('6');
    expect(d.extra).toEqual({ poePorts: [1, 2, 3, 4], grouping: 8 });
    expect(RegionSchema.parse(draftToRegion(d))).toEqual(r);
  });
  it('turns percentages into fractions and leaves blanks out', () => {
    const d = { ...blankRegion('vent'), x: '50', w: '' };
    expect(draftToRegion(d)).toEqual({ type: 'vent', x: 0.5 });
  });
  it('drops counts on regions that have none and clamps positions', () => {
    expect(draftToRegion({ ...blankRegion('display'), count: '3', x: '140' })).toEqual({ type: 'display', x: 1, variant: 'lcd' });
  });
});
