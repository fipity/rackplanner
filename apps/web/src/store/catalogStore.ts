import type { Catalog, Part } from '@rackplanner/shared';
import { create } from 'zustand';
import { fetchCatalog } from '../lib/api';

interface CatalogState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  parts: Part[];
  catalog: Catalog;
  load: () => Promise<void>;
}

export const useCatalogStore = create<CatalogState>()((set, get) => ({
  status: 'idle',
  error: null,
  parts: [],
  catalog: new Map(),
  load: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading', error: null });
    try {
      const { parts } = await fetchCatalog();
      set({ status: 'ready', parts, catalog: new Map(parts.map((p) => [p.id, p])) });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },
}));
