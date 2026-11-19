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
  /** Only 3D-printed parts. */
  onlyPrinted: boolean;
}

export const DEFAULT_FILTERS: CatalogFilters = {
  brand: '',
  category: '',
  height: '',
  poe: 'any',
  rackWidth: 'any',
  hideLegacy: false,
  onlyCustom: false,
  onlyPrinted: false,
};

/** Part being edited in the custom part builder (null = closed). */
export type BuilderState = { mode: 'create' | 'edit' | 'copy'; partId?: string } | null;
/** 3D-printed part dialog: add from a link, or edit an existing printed part (null = closed). */
export type PrintedDialogState = { mode: 'create'; url?: string } | { mode: 'edit'; partId: string } | null;
/** A printed mount being removed while it holds devices: ask what to do with them. */
export type MountRemoval = { placementId: string } | null;

interface UiState {
  selectedId: string | null;
  view: View;
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
  printedDialog: PrintedDialogState;
  mountRemoval: MountRemoval;
  /** Minimap in the canvas corner (remembered). */
  minimap: boolean;
  /** Keyboard / mouse shortcuts popup. */
  shortcutsOpen: boolean;
  select: (id: string | null) => void;
  setView: (v: View) => void;
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
  openPrinted: (p: PrintedDialogState) => void;
  setMountRemoval: (m: MountRemoval) => void;
  setMinimap: (v: boolean) => void;
  setShortcutsOpen: (v: boolean) => void;
}

const THEME_KEY = 'rackplanner.theme';

export function applyTheme(theme: Theme): void {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

const savedTheme = readLocal(THEME_KEY);
const LEDS_KEY = 'rackplanner.leds';
const MINIMAP_KEY = 'rackplanner.minimap';

export const useUiStore = create<UiState>()((set, get) => ({
  selectedId: null,
  view: 'front',
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
  printedDialog: null,
  mountRemoval: null,
  minimap: readLocal(MINIMAP_KEY) === 'on',
  shortcutsOpen: false,
  select: (selectedId) => set(selectedId ? { selectedId, selectedCableId: null, rightTab: 'details' } : { selectedId }),
  setView: (view) => set({ view }),
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
  openPrinted: (printedDialog) => set({ printedDialog, ...(printedDialog ? { builder: null } : {}) }),
  setMountRemoval: (mountRemoval) => set({ mountRemoval }),
  setMinimap: (minimap) => {
    writeLocal(MINIMAP_KEY, minimap ? 'on' : 'off');
    set({ minimap });
  },
  setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
}));
