import { create } from 'zustand';

export type SaveStatus = 'idle' | 'saved' | 'pending' | 'saving' | 'error' | 'conflict';

interface SaveState {
  designId: string | null;
  /** Server revision of the last successful load/save. */
  revision: number;
  status: SaveStatus;
  error: string | null;
  lastSavedAt: number | null;
  init: (designId: string, revision: number) => void;
  set: (patch: Partial<Omit<SaveState, 'init' | 'set'>>) => void;
}

export const useSaveStore = create<SaveState>()((set) => ({
  designId: null,
  revision: 0,
  status: 'idle',
  error: null,
  lastSavedAt: null,
  init: (designId, revision) => set({ designId, revision, status: 'saved', error: null, lastSavedAt: Date.now() }),
  set: (patch) => set(patch),
}));
