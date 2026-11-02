/** Height of one rack unit in millimetres (EIA-310). */
export const U_MM = 44.45;

export type RackWidth = '19in' | '10in';
export const RACK_WIDTHS: readonly RackWidth[] = ['19in', '10in'];

/** Usable opening between the mounting rails, in mm. */
export const RACK_OPENING_MM: Record<RackWidth, number> = {
  '19in': 450,
  '10in': 222,
};

/** Overall panel width including mounting ears, in mm. */
export const RACK_PANEL_MM: Record<RackWidth, number> = {
  '19in': 482.6,
  '10in': 254,
};

export const MIN_RACK_U = 1;
export const MAX_RACK_U = 32;
export const RACK_HEIGHT_PRESETS = [4, 6, 8, 9, 12, 15, 18, 22, 24, 27, 32] as const;
export const RACK_DEPTH_PRESETS = [200, 300, 450, 600, 800, 1000] as const;

/** Floating point tolerance used for U / mm comparisons. */
export const EPS = 1e-6;

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}
