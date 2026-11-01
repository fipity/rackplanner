import type { DropResolution, Mounting } from '@rackplanner/shared';
import { create } from 'zustand';

export interface ActiveDrag {
  kind: 'catalog' | 'placement';
  partId: string;
  placementId?: string;
  mounting: Mounting;
  /** Offset (mm) from the part's top-left corner to the pointer. */
  grabDx: number;
  grabDy: number;
}

interface DragState {
  active: ActiveDrag | null;
  resolution: DropResolution | null;
  overRack: boolean;
  pointer: { x: number; y: number } | null;
  start: (a: ActiveDrag) => void;
  update: (p: { resolution: DropResolution | null; overRack: boolean; pointer: { x: number; y: number } }) => void;
  end: () => void;
}

export const useDragStore = create<DragState>()((set) => ({
  active: null,
  resolution: null,
  overRack: false,
  pointer: null,
  start: (active) => set({ active, resolution: null, overRack: false, pointer: null }),
  update: (p) => set(p),
  end: () => set({ active: null, resolution: null, overRack: false, pointer: null }),
}));
