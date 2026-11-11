/**
 * Style presets: bezel colours, accent, label font, LED colours and vent
 * pattern. Generic, brand-inspired looks only (no logos or trade dress
 * beyond a colour family): UniFi-like silver/white with a light-blue status
 * bar, a black server bezel, a dark grey NAS and so on.
 */
import type { StylePreset } from '@rackplanner/shared';

export type VentPattern = 'honeycomb' | 'slots' | 'mesh' | 'holes';

export interface PresetTokens {
  /** Bezel gradient, top to bottom. */
  bezel: [string, string];
  edge: string;
  /** Thin top highlight (bevel). */
  highlight: string;
  ear: [string, string];
  text: string;
  textDim: string;
  font: string;
  fontWeight: number;
  accent: string;
  /** RJ45 housing colour around the opening. */
  jack: string;
  /** Bay tray face. */
  tray: [string, string];
  keystone: string;
  vent: VentPattern;
  /** Corner radius for desktop bodies (mm). */
  radius: number;
  /** Light body (dark text, light-ish ports surround). */
  light: boolean;
}

export const LED = {
  link: '#22c55e',
  activity: '#f59e0b',
  status: '#38bdf8',
  power: '#22c55e',
  fault: '#ef4444',
  poe: '#f59e0b',
  off: '#3a3f46',
  offLight: '#9aa1a9',
};

const SANS = 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
const CONDENSED = '"Arial Narrow", "Roboto Condensed", ui-sans-serif, system-ui, sans-serif';

const dark = (over: Partial<PresetTokens>): PresetTokens => ({
  bezel: ['#2c3036', '#1b1e22'],
  edge: '#0c0d0f',
  highlight: 'rgba(255,255,255,0.14)',
  ear: ['#30343a', '#1f2226'],
  text: '#d6dae0',
  textDim: '#8a919b',
  font: SANS,
  fontWeight: 600,
  accent: '#64748b',
  jack: '#3b4047',
  tray: ['#2a2e33', '#1c1f23'],
  keystone: '#e5e7eb',
  vent: 'slots',
  radius: 2,
  light: false,
  ...over,
});

const light = (over: Partial<PresetTokens>): PresetTokens => ({
  bezel: ['#eceff2', '#cfd4d9'],
  edge: '#8e959d',
  highlight: 'rgba(255,255,255,0.85)',
  ear: ['#dfe3e7', '#c3c9ce'],
  text: '#3f4650',
  textDim: '#7a828c',
  font: SANS,
  fontWeight: 600,
  accent: '#38bdf8',
  jack: '#b9bfc6',
  tray: ['#c9ced3', '#aeb4ba'],
  keystone: '#f3f4f6',
  vent: 'holes',
  radius: 3,
  light: true,
  ...over,
});

export const PRESETS: Record<StylePreset, PresetTokens> = {
  'unifi-silver': light({ accent: '#38bdf8', vent: 'holes' }),
  'unifi-white': light({
    bezel: ['#fbfbfc', '#e7eaed'],
    edge: '#b4bbc2',
    ear: ['#f1f3f5', '#dde1e5'],
    accent: '#0ea5e9',
    jack: '#d3d8dd',
    radius: 4,
    vent: 'holes',
  }),
  'unifi-black': dark({ bezel: ['#2f3338', '#1d2024'], accent: '#38bdf8', vent: 'holes', jack: '#454b53' }),
  'dell-bezel': dark({
    bezel: ['#26292d', '#121416'],
    accent: '#7aa7ff',
    vent: 'honeycomb',
    text: '#c7cdd5',
    tray: ['#2b2f34', '#16181b'],
  }),
  hpe: dark({ bezel: ['#3a3f45', '#25292d'], accent: '#01a982', vent: 'mesh', tray: ['#34393f', '#212428'] }),
  synology: dark({ bezel: ['#4a4f55', '#33373c'], accent: '#9aa3ad', vent: 'slots', text: '#e5e7eb', tray: ['#3a3e43', '#26292d'] }),
  mikrotik: light({ bezel: ['#e4e6e8', '#c4c8cc'], accent: '#ef4444', vent: 'slots', font: CONDENSED, radius: 1.5 }),
  'generic-black': dark({}),
  'generic-silver': light({ accent: '#64748b', vent: 'slots', radius: 2 }),
  'patch-panel': dark({ bezel: ['#24272b', '#131518'], vent: 'slots', keystone: '#e5e7eb' }),
  'brush-panel': dark({ bezel: ['#24272b', '#131518'] }),
  shelf: dark({ bezel: ['#3a3f45', '#24282d'], vent: 'slots' }),
  pdu: dark({ bezel: ['#2a2d31', '#17191c'], accent: '#ef4444', vent: 'slots' }),
  ups: dark({ bezel: ['#31353a', '#1d2024'], accent: '#22c55e', vent: 'slots' }),
  'rpi-case': light({
    bezel: ['#d9264f', '#b5163c'],
    edge: '#7f1029',
    highlight: 'rgba(255,255,255,0.35)',
    text: '#ffffff',
    textDim: '#fecdd3',
    accent: '#ef4444',
    jack: '#9b9fa4',
    radius: 4,
    light: false,
  }),
};

export const PRESET_LABELS: Record<StylePreset, string> = {
  'unifi-silver': 'UniFi-style silver',
  'unifi-white': 'UniFi-style white (desktop)',
  'unifi-black': 'UniFi-style black',
  'dell-bezel': 'Server bezel (black honeycomb)',
  hpe: 'Server (dark grey, green accent)',
  synology: 'NAS (dark grey)',
  mikrotik: 'Light metal (red accent)',
  'generic-black': 'Generic black',
  'generic-silver': 'Generic silver',
  'patch-panel': 'Patch panel',
  'brush-panel': 'Brush panel',
  shelf: 'Shelf',
  pdu: 'PDU / power board',
  ups: 'UPS',
  'rpi-case': 'Red & white SBC case',
};

/** Gradient id for a preset's bezel (defined once in FaceplateDefs). */
export const bezelId = (p: StylePreset) => `rp-bezel-${p}`;
export const earId = (p: StylePreset) => `rp-ear-${p}`;
export const trayId = (p: StylePreset) => `rp-tray-${p}`;
