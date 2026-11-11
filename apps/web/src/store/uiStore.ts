import type { CableEnd } from '@rackplanner/shared';
import { create } from 'zustand';
import type { View } from '../components/rack/geometry';
import { readLocal, writeLocal } from '../lib/storage';

export type Theme = 'light' | 'dark' | 'system';

export interface CatalogFilters {
  brand: string;
  category: string;
  /** '' = any, otherwise a U height; 'tall' = 4U and up. */
  height: string;
  poe: 'any' | 'yes' | 'no';
  /** Rack width compatibility filter, independent of the current rack. */
  rackWidth: 'any' | '19in' | '10in';
  hideLegacy: boolean;
  onlyCustom: boolean;
}

export const DEFAULT_FILTERS: CatalogFilters = {
  brand: '',
  category: '',
  height: '',
  poe: 'any',
  rackWidth: 'any',
  hideLegacy: false,
  onlyCustom: false,
};

/** Part being edited in the custom part builder (null = closed). */
export type BuilderState = { mode: 'create' | 'edit' | 'copy'; partId?: string } | null;
export type Zoom = 'fit' | number; // number = CSS px per mm

interface UiState {
  selectedId: string | null;
  view: View;
  zoom: Zoom;
  /** Last fitted scale, used as the starting point when zooming from "fit". */
  fitScale: number;
  theme: Theme;
  showIncompatible: boolean;
  /** Cable drawing mode: clicks on ports/devices create cables instead of selecting. */
  cableMode: boolean;
  /** First end of a cable being drawn. */
  pendingEnd: CableEnd | null;
  selectedCableId: string | null;
  showCables: boolean;
  /** Status LEDs drawn lit; off gives a cleaner print look. */
  leds: boolean;
  /** Rack drawing mode: device faces, or a top-down plan of the shelves. */
  plan: boolean;
  /** Right panel tab. */
  rightTab: 'details' | 'stats';
  /** On narrow screens the right panel is an overlay; this opens it without a selection. */
  panelOpen: boolean;
  filters: CatalogFilters;
  builder: BuilderState;
  select: (id: string | null) => void;
  setView: (v: View) => void;
  setZoom: (z: Zoom) => void;
  setFitScale: (s: number) => void;
  zoomBy: (factor: number) => void;
  setTheme: (t: Theme) => void;
  setShowIncompatible: (v: boolean) => void;
  setRightTab: (t: 'details' | 'stats') => void;
  setCableMode: (v: boolean) => void;
  setPendingEnd: (e: CableEnd | null) => void;
  selectCable: (id: string | null) => void;
  setShowCables: (v: boolean) => void;
  setLeds: (v: boolean) => void;
  setPlan: (v: boolean) => void;
  setPanelOpen: (v: boolean) => void;
  setFilters: (patch: Partial<CatalogFilters>) => void;
  resetFilters: () => void;
  openBuilder: (b: BuilderState) => void;
}

const THEME_KEY = 'rackplanner.theme';

export function applyTheme(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

const savedTheme = readLocal(THEME_KEY);
const LEDS_KEY = 'rackplanner.leds';

export const useUiStore = create<UiState>()((set, get) => ({
  selectedId: null,
  view: 'front',
  zoom: 'fit',
  fitScale: 1,
  theme: savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'system',
  showIncompatible: false,
  cableMode: false,
  pendingEnd: null,
  selectedCableId: null,
  showCables: true,
  leds: readLocal(LEDS_KEY) !== 'off',
  plan: false,
  rightTab: 'stats',
  panelOpen: false,
  filters: DEFAULT_FILTERS,
  builder: null,
  select: (selectedId) => set(selectedId ? { selectedId, selectedCableId: null, rightTab: 'details' } : { selectedId }),
  setView: (view) => set({ view }),
  setZoom: (zoom) => set({ zoom }),
  setFitScale: (fitScale) => set({ fitScale }),
  zoomBy: (factor) => {
    const { zoom, fitScale } = get();
    const current = zoom === 'fit' ? fitScale : zoom;
    set({ zoom: Math.min(8, Math.max(0.3, current * factor)) });
  },
  setTheme: (theme) => {
    writeLocal(THEME_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
  setShowIncompatible: (showIncompatible) => set({ showIncompatible }),
  setRightTab: (rightTab) => set({ rightTab }),
  setCableMode: (cableMode) => set({ cableMode, pendingEnd: null, ...(cableMode ? { showCables: true } : {}) }),
  setPendingEnd: (pendingEnd) => set({ pendingEnd }),
  selectCable: (selectedCableId) => set(selectedCableId ? { selectedCableId, selectedId: null, rightTab: 'details' } : { selectedCableId }),
  setShowCables: (showCables) => set({ showCables }),
  setLeds: (leds) => {
    writeLocal(LEDS_KEY, leds ? 'on' : 'off');
    set({ leds });
  },
  setPlan: (plan) => set({ plan }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
  resetFilters: () => set({ filters: DEFAULT_FILTERS }),
  openBuilder: (builder) => set({ builder }),
}));
