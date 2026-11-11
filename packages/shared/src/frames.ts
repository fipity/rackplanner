import type { RackFrame } from './schemas.js';
import { U_MM, type RackWidth } from './units.js';

export interface RackFrameInfo {
  label: string;
  description: string;
  widths: readonly RackWidth[];
  /** Product racks have a fixed height and depth. */
  fixedU?: number;
  /** Usable internal depth, mm. */
  depthMm?: number;
  /** Usable width between the side frames (narrower than the rail opening on some mini racks). */
  innerWidthMm?: number;
  /** External W × D × H in mm (H includes handles). */
  outerMm?: { w: number; d: number; h: number };
  supportsDoor: boolean;
  sources: readonly string[];
  /** Drawing allowances in mm: panels above/below the rails, posts outside the rails, carry handle. */
  draw: { top: number; bottom: number; post: number; handle: number };
}

export const RACK_FRAME_INFO: Record<RackFrame, RackFrameInfo> = {
  'open-2post': {
    label: '2-post open frame',
    description: 'Relay rack: two uprights on a floor base, open on all sides.',
    widths: ['19in', '10in'],
    supportsDoor: false,
    sources: [],
    draw: { top: 12, bottom: 34, post: 4, handle: 0 },
  },
  'open-4post': {
    label: '4-post open frame',
    description: 'Four uprights with front and rear rails, open sides.',
    widths: ['19in', '10in'],
    supportsDoor: false,
    sources: [],
    draw: { top: 14, bottom: 14, post: 6, handle: 0 },
  },
  cabinet: {
    label: 'Enclosed cabinet',
    description: 'Server or wall cabinet with side panels, top and plinth; optional glass door.',
    widths: ['19in', '10in'],
    supportsDoor: true,
    sources: [],
    draw: { top: 36, bottom: 44, post: 16, handle: 0 },
  },
  'mini-10in': {
    label: '10″ mini rack',
    description: 'Generic 10-inch open desktop rack.',
    widths: ['10in'],
    supportsDoor: false,
    sources: [],
    draw: { top: 12, bottom: 14, post: 6, handle: 0 },
  },
  'rackmate-t1': {
    label: 'DeskPi RackMate T1 (8U)',
    description: '10-inch 8U desktop cabinet, die-cast aluminium frame, acrylic sides, open front and rear, twin top handles.',
    widths: ['10in'],
    fixedU: 8,
    depthMm: 212,
    innerWidthMm: 212,
    outerMm: { w: 281, d: 200, h: 451 },
    supportsDoor: false,
    sources: ['https://wiki.deskpi.com/rackmate/rackmate-t1'],
    // 451 mm overall − 33 mm handles − 8 × 44.45 mm leaves 62.4 mm of top and bottom frame.
    draw: { top: 31.2, bottom: 31.2, post: 13.5, handle: 33 },
  },
  'rackmate-t2': {
    label: 'DeskPi RackMate T2 (12U)',
    description: '10-inch 12U desktop rack, transparent acrylic sides, open front and rear, top handle.',
    widths: ['10in'],
    fixedU: 12,
    depthMm: 260,
    innerWidthMm: 212,
    outerMm: { w: 281, d: 260, h: 629 },
    supportsDoor: false,
    sources: ['https://wiki.deskpi.com/rackmate/rackmate-t2'],
    // 596 mm chassis − 12 × 44.45 mm leaves 62.6 mm of top and bottom frame; handle adds 33 mm.
    draw: { top: 31.3, bottom: 31.3, post: 13.5, handle: 33 },
  },
};

/** Frames that suit a rack width. */
export function framesFor(width: RackWidth): RackFrame[] {
  return (Object.keys(RACK_FRAME_INFO) as RackFrame[]).filter((f) => RACK_FRAME_INFO[f].widths.includes(width));
}

/** Height in mm the frame drawing spans, for sanity checks against product dimensions. */
export function frameDrawnHeightMm(frame: RackFrame, heightU: number): number {
  const d = RACK_FRAME_INFO[frame].draw;
  return d.handle + d.top + heightU * U_MM + d.bottom;
}
