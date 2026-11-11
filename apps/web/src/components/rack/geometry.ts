import { RACK_FRAME_INFO, openingMm, partWidthMm, isFullWidth, type Part, type Rack } from '@rackplanner/shared';
import { U_MM } from '@rackplanner/shared';

/** SVG layout constants, all in millimetres (the SVG user unit). */
export const LABEL_COL = 20; // U-number column on each side, outside the frame
export const RAIL = 16; // mounting rail / ear width

export type View = 'front' | 'rear';

/** Which face of a device you see from `view`, given the faces it occupies (rear-mounted gear faces backwards). */
export function faceSeen(faces: readonly View[], view: View): View {
  if (faces.length === 2) return view;
  return faces[0] === view ? 'front' : 'rear';
}

export interface RackLayout {
  rack: Rack;
  opening: number;
  width: number;
  height: number;
  /** Left edge of the left rail (where full-width ears start). */
  railX: number;
  /** Left edge of the opening. */
  innerX: number;
  /** Y of the top of the top U. */
  top: number;
  frame: (typeof RACK_FRAME_INFO)[keyof typeof RACK_FRAME_INFO]['draw'];
}

export function rackLayout(rack: Rack): RackLayout {
  const opening = openingMm(rack.width);
  const frame = RACK_FRAME_INFO[rack.frame ?? 'open-4post'].draw;
  const railX = LABEL_COL + frame.post;
  return {
    rack,
    opening,
    width: (railX + RAIL) * 2 + opening,
    height: frame.handle + frame.top + rack.heightU * U_MM + frame.bottom,
    railX,
    innerX: railX + RAIL,
    top: frame.handle + frame.top,
    frame,
  };
}

/** Y coordinate of the top edge of a box whose top boundary is at `uTop`. */
export function uTopToY(layout: RackLayout, uTop: number): number {
  return layout.top + (layout.rack.heightU + 1 - uTop) * U_MM;
}

export function yToUTop(layout: RackLayout, y: number): number {
  return layout.rack.heightU + 1 - (y - layout.top) / U_MM;
}

/** Front-view xMm → SVG x for the given view (rear mirrors horizontally). */
export function xToSvg(layout: RackLayout, xMm: number, widthMm: number, view: View): number {
  return layout.innerX + (view === 'front' ? xMm : layout.opening - xMm - widthMm);
}

export function svgToXMm(layout: RackLayout, svgX: number, widthMm: number, view: View): number {
  const local = svgX - layout.innerX;
  return view === 'front' ? local : layout.opening - local - widthMm;
}

export interface DeviceBox {
  x: number;
  y: number;
  w: number;
  h: number;
  ears: boolean;
}

/** Thickness of a shelf's tray as drawn (items on the shelf stand on it). */
export function shelfTrayMm(shelfPart: Part): number {
  return Math.min(4, shelfPart.heightU * U_MM * 0.12);
}

/**
 * Box to draw for a device occupying [u0, u1) at xMm. Full-width devices span
 * the rails (ears). `lift` raises the box (mm), e.g. onto a shelf's tray.
 */
export function deviceBox(layout: RackLayout, part: Part, u0: number, u1: number, xMm: number, view: View, onShelf: boolean, lift = 0): DeviceBox {
  const y = uTopToY(layout, u1) - lift;
  const h = (u1 - u0) * U_MM;
  const w = partWidthMm(part);
  if (!onShelf && part.formFactor === 'rack' && isFullWidth(part, layout.rack.width)) {
    return { x: layout.railX, y, w: layout.opening + RAIL * 2, h, ears: true };
  }
  return { x: xToSvg(layout, xMm, w, view), y, w, h, ears: false };
}
