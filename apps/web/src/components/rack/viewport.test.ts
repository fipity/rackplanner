import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  centreOn,
  constrain,
  fitRect,
  fromSaved,
  mouseWheelZoomFactor,
  wheelSource,
  isVisible,
  panBy,
  screenRect,
  screenToWorld,
  toSaved,
  wheelPixels,
  wheelZoomFactor,
  worldToScreen,
  zoomAt,
  zoomBy,
  type ViewTransform,
} from './viewport';

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('screen ↔ world', () => {
  it.each<ViewTransform>([
    { x: 0, y: 0, k: 1 },
    { x: 120, y: -40, k: 2.5 },
    { x: -900, y: 300, k: 0.1 },
    { x: 33.3, y: 77.7, k: 8 },
  ])('round-trips at %o', (t) => {
    for (const p of [{ x: 0, y: 0 }, { x: 412, y: 97 }, { x: -50, y: 1200 }]) {
      close(worldToScreen(t, screenToWorld(t, p)), p);
      close(screenToWorld(t, worldToScreen(t, p)), p);
    }
  });

  it('applies scale then translation', () => {
    expect(worldToScreen({ x: 10, y: 20, k: 3 }, { x: 5, y: 7 })).toEqual({ x: 25, y: 41 });
    expect(screenToWorld({ x: 10, y: 20, k: 3 }, { x: 25, y: 41 })).toEqual({ x: 5, y: 7 });
  });
});

describe('zoom towards the cursor', () => {
  it.each([
    [{ x: 0, y: 0, k: 1 }, 2, { x: 300, y: 200 }],
    [{ x: -140, y: 60, k: 0.4 }, 3.1, { x: 12, y: 590 }],
    [{ x: 500, y: 500, k: 6 }, 0.2, { x: 800, y: 10 }],
  ])('keeps the point under the cursor fixed', (t, k, anchor) => {
    const before = screenToWorld(t, anchor);
    const z = zoomAt(t, k, anchor);
    expect(z.k).toBeCloseTo(k, 9);
    close(worldToScreen(z, before), anchor);
  });

  it('clamps to 10%–800% and still keeps the anchor', () => {
    const t = { x: 40, y: 40, k: 1 };
    const a = { x: 200, y: 150 };
    const out = zoomAt(t, 50, a);
    expect(out.k).toBe(MAX_ZOOM);
    close(worldToScreen(out, screenToWorld(t, a)), a);
    expect(zoomAt(t, 0.001, a).k).toBe(MIN_ZOOM);
    expect(zoomBy(t, 2, a).k).toBe(2);
  });

  it('gives smooth factors for small deltas and caps big notches', () => {
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(-4)).toBeGreaterThan(1);
    expect(wheelZoomFactor(-4)).toBeLessThan(1.03);
    expect(wheelZoomFactor(-1000)).toBeCloseTo(wheelZoomFactor(-100));
    expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1);
  });
});

describe('fit to screen', () => {
  it('fits and centres the content with padding', () => {
    const t = fitRect({ x: 0, y: 0, w: 300, h: 1000 }, { w: 800, h: 600 }, 24);
    expect(t.k).toBeCloseTo(552 / 1000);
    const r = screenRect(t, { x: 0, y: 0, w: 300, h: 1000 });
    expect(r.y).toBeCloseTo(24);
    expect(r.y + r.h).toBeCloseTo(576);
    expect(r.x + r.w / 2).toBeCloseTo(400);
  });

  it('fits wide content by width', () => {
    const t = fitRect({ x: 100, y: 50, w: 2000, h: 200 }, { w: 1000, h: 800 }, 0);
    expect(t.k).toBeCloseTo(0.5);
    close(worldToScreen(t, { x: 1100, y: 150 }), { x: 500, y: 400 });
  });

  it('respects a maximum zoom (zoom to selection)', () => {
    expect(fitRect({ x: 0, y: 0, w: 10, h: 10 }, { w: 800, h: 600 }, 24, 4).k).toBe(4);
  });

  it('centres a point', () => {
    close(worldToScreen(centreOn({ x: 70, y: 30 }, 2, { w: 400, h: 300 }), { x: 70, y: 30 }), { x: 200, y: 150 });
  });
});

describe('soft bounds', () => {
  const content = { x: 0, y: 0, w: 500, h: 1000 };
  const size = { w: 800, h: 600 };

  it('lets the rack go a full viewport past every edge', () => {
    const t = { x: 0, y: 0, k: 1 };
    for (const [dx, dy] of [[-1300, 0], [1600, 0], [0, -1600], [0, 1200]] as const) {
      const moved = panBy(t, dx, dy);
      expect(constrain(moved, content, size)).toEqual(moved);
    }
  });

  it('stops it beyond that, so it can always be brought back', () => {
    const r = screenRect(constrain({ x: -5000, y: 9000, k: 1 }, content, size), content);
    expect(r.x + r.w).toBeCloseTo(-800);
    expect(r.y).toBeCloseTo(1200);
  });

  it('works at every zoom', () => {
    for (const k of [MIN_ZOOM, 1, MAX_ZOOM]) {
      const r = screenRect(constrain({ x: 1e6, y: -1e6, k }, content, size), content);
      expect(r.x).toBeCloseTo(1600);
      expect(r.y + r.h).toBeCloseTo(-600);
    }
  });

  it('knows when the rack is out of view', () => {
    expect(isVisible({ x: 0, y: 0, k: 1 }, content, size)).toBe(true);
    expect(isVisible({ x: -600, y: 0, k: 1 }, content, size)).toBe(false);
    expect(isVisible({ x: 0, y: 650, k: 1 }, content, size)).toBe(false);
  });
});

describe('wheel input', () => {
  it('converts lines and pages to pixels', () => {
    expect(wheelPixels({ deltaX: 0, deltaY: 3, deltaMode: 1, shiftKey: false }, { w: 800, h: 600 })).toEqual({ x: 0, y: 48 });
    expect(wheelPixels({ deltaX: 0, deltaY: 1, deltaMode: 2, shiftKey: false }, { w: 800, h: 600 })).toEqual({ x: 0, y: 600 });
  });
  it('Shift + wheel goes sideways (unless the platform already did it)', () => {
    expect(wheelPixels({ deltaX: 0, deltaY: 100, deltaMode: 0, shiftKey: true }, { w: 1, h: 1 })).toEqual({ x: 100, y: 0 });
    expect(wheelPixels({ deltaX: 100, deltaY: 0, deltaMode: 0, shiftKey: true }, { w: 1, h: 1 })).toEqual({ x: 100, y: 0 });
  });
  it('trackpads pan diagonally', () => {
    expect(wheelPixels({ deltaX: 12, deltaY: -7, deltaMode: 0, shiftKey: false }, { w: 1, h: 1 })).toEqual({ x: 12, y: -7 });
  });
});

describe('saved views', () => {
  it('restore the same centre and zoom on a different canvas size', () => {
    const t = { x: -230, y: 40, k: 1.75 };
    const saved = toSaved(t, { w: 1000, h: 700 });
    const back = fromSaved(saved, { w: 600, h: 900 });
    expect(back.k).toBeCloseTo(1.75);
    const c = screenToWorld(back, { x: 300, y: 450 });
    expect(c.x).toBeCloseTo(saved.cx, 1);
    expect(c.y).toBeCloseTo(saved.cy, 1);
  });
});

describe('mouse wheel or trackpad', () => {
  const ev = (deltaX: number, deltaY: number, deltaMode = 0) => ({ deltaX, deltaY, deltaMode });
  it.each([
    ['Chrome mouse notch', ev(0, 100), 'mouse'],
    ['Chrome mouse notch, other direction', ev(0, -100), 'mouse'],
    ['Windows mouse notch', ev(0, 120), 'mouse'],
    ['Firefox mouse (lines)', ev(0, 3, 1), 'mouse'],
    ['trackpad, small', ev(0, 4), 'trackpad'],
    ['Chrome mouse at 150% display scaling', ev(0, 66.66667), 'mouse'],
    ['Firefox mouse in pixel mode', ev(0, 57.6), 'mouse'],
    ['Linux Chrome mouse', ev(0, 53), 'mouse'],
    ['mouse with wheelDeltaY', { ...ev(0, 33.3), wheelDeltaY: -120 }, 'mouse'],
    ['Mac trackpad (wheelDeltaY = −3 × deltaY)', { ...ev(0, 12), wheelDeltaY: -36 }, 'trackpad'],
    ['trackpad with wheelDeltaY', { ...ev(0, 7.5), wheelDeltaY: -22 }, 'trackpad'],
    ['trackpad, diagonal', ev(12, -70), 'trackpad'],
    ['trackpad, sideways', ev(30, 0), 'trackpad'],
  ] as const)('%s → %s', (_n, e, want) => expect(wheelSource(e, 1000, null)).toBe(want));

  it('a trackpad swipe stays a pan even when one event looks like a mouse notch', () => {
    let last = { source: wheelSource(ev(0, 3), 0, null), at: 0 };
    expect(last.source).toBe('trackpad');
    last = { source: wheelSource(ev(0, 100), 50, last), at: 50 };
    expect(last.source).toBe('trackpad');
    // After a pause, the next event is judged afresh.
    expect(wheelSource(ev(0, 100), 500, last)).toBe('mouse');
  });

  it('zooms about 1.2× per notch, in, out, and the same in every browser', () => {
    expect(mouseWheelZoomFactor({ deltaY: -100, deltaMode: 0 })).toBeCloseTo(1.197, 2);
    expect(mouseWheelZoomFactor({ deltaY: 100, deltaMode: 0 })).toBeCloseTo(1 / 1.197, 2);
    expect(mouseWheelZoomFactor({ deltaY: -3, deltaMode: 1 })).toBeCloseTo(mouseWheelZoomFactor({ deltaY: -99, deltaMode: 0 }), 5);
  });
});
