import type { Catalog, Part } from '@rackplanner/shared';
import { create } from 'zustand';
import { fetchCatalog } from '../lib/api';

interface CatalogState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  error: string | null;
  /** Every known part, including retired ones (needed to render old designs). */
  parts: Part[];
  /** Ids hidden from the catalog list because they left their seed file. */
  retired: ReadonlySet<string>;
  catalog: Catalog;
  load: () => Promise<void>;
  upsert: (part: Part) => void;
  remove: (id: string) => void;
}

const index = (parts: Part[]): Catalog => new Map(parts.map((p) => [p.id, p]));

export const useCatalogStore = create<CatalogState>()((set, get) => ({
  status: 'idle',
  error: null,
  parts: [],
  retired: new Set(),
  catalog: new Map(),
  load: async () => {
    if (get().status === 'loading') return;
    set({ status: 'loading', error: null });
    try {
      const { parts, retired } = await fetchCatalog();
      set({ status: 'ready', parts, retired: new Set(retired), catalog: index(parts) });
    } catch (err) {
      set({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  },
  upsert: (part) => {
    const parts = [...get().parts.filter((p) => p.id !== part.id), part];
    set({ parts, catalog: index(parts) });
  },
  remove: (id) => {
    const parts = get().parts.filter((p) => p.id !== id);
    set({ parts, catalog: index(parts) });
  },
}));
