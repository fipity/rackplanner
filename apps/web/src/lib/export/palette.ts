import type { CSSProperties } from 'react';

/** Fixed rack colours for exports (CSS variables don't exist outside the page). */
export const EXPORT_PALETTE: Record<string, string> = {
  '--rack-frame': '#3f4650',
  '--rack-frame-edge': '#2b3037',
  '--rack-interior': '#14171b',
  '--rack-rail': '#59616c',
  '--rack-hole': '#1b1f24',
  '--rack-label': '#4b5563',
  '--rack-slot-line': 'rgba(255,255,255,0.05)',
};

export function resolveCssVars(svg: string): string {
  return svg.replace(/var\((--rack-[a-z-]+)\)/g, (m, name: string) => EXPORT_PALETTE[name] ?? m);
}

/** Inline style that makes an on-page RackView use the export palette (print view). */
// CSS custom properties aren't in CSSProperties' type; the object is valid inline style.
export const exportPaletteStyle = EXPORT_PALETTE as unknown as CSSProperties;
