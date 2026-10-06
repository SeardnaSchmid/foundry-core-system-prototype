import { describe, expect, it } from 'vitest';
import { popoverPosition } from '../../module/helpers/popover.mjs';

const viewport = { width: 1000, height: 800 };
const popover = { width: 200, height: 100 };

describe('popoverPosition', () => {
  it('sits below the anchor, aligned to its left edge', () => {
    expect(popoverPosition({ left: 100, top: 50, bottom: 70 }, popover, viewport)).toEqual({ left: 100, top: 76 });
  });

  it('flips above the anchor when there is no room below', () => {
    expect(popoverPosition({ left: 100, top: 700, bottom: 720 }, popover, viewport)).toEqual({ left: 100, top: 594 });
  });

  it('never leaves the viewport on either side or the top', () => {
    expect(popoverPosition({ left: 950, top: 50, bottom: 70 }, popover, viewport).left).toBe(792);
    expect(popoverPosition({ left: -20, top: 50, bottom: 70 }, popover, viewport).left).toBe(8);
    expect(popoverPosition({ left: 0, top: 40, bottom: 790 }, popover, viewport).top).toBe(8);
  });
});
