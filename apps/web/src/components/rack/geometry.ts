import { openingMm, partWidthMm, isFullWidth, type Part, type Rack } from '@rackplanner/shared';
import { U_MM } from '@rackplanner/shared';

/** SVG layout constants, all in millimetres (the SVG user unit). */
export const GUTTER = 24; // U-number column on each side
export const RAIL = 16; // mounting rail / ear width
export const FRAME = 14; // top & bottom frame

export type View = 'front' | 'rear';

export interface RackLayout {
  rack: Rack;
  opening: number;
  width: number;
  height: number;
  innerX: number; // left edge of the opening
}

export function rackLayout(rack: Rack): RackLayout {
  const opening = openingMm(rack.width);
  return {
    rack,
    opening,
    width: GUTTER * 2 + RAIL * 2 + opening,
    height: FRAME * 2 + rack.heightU * U_MM,
    innerX: GUTTER + RAIL,
  };
}

/** Y coordinate of the top edge of a box whose top boundary is at `uTop`. */
export function uTopToY(layout: RackLayout, uTop: number): number {
  return FRAME + (layout.rack.heightU + 1 - uTop) * U_MM;
}

export function yToUTop(layout: RackLayout, y: number): number {
  return layout.rack.heightU + 1 - (y - FRAME) / U_MM;
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

/** Box to draw for a device occupying [u0, u1) at xMm. Full-width devices span the rails (ears). */
export function deviceBox(layout: RackLayout, part: Part, u0: number, u1: number, xMm: number, view: View, onShelf: boolean): DeviceBox {
  const y = uTopToY(layout, u1);
  const h = (u1 - u0) * U_MM;
  const w = partWidthMm(part);
  if (!onShelf && part.formFactor === 'rack' && isFullWidth(part, layout.rack.width)) {
    return { x: GUTTER, y, w: layout.opening + RAIL * 2, h, ears: true };
  }
  return { x: xToSvg(layout, xMm, w, view), y, w, h, ears: false };
}
