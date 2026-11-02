import { newId, type Cable, type Design, type PlacedPart, type Rack } from '@rackplanner/shared';
import { temporal } from 'zundo';
import { create } from 'zustand';
import { useStore } from 'zustand';
import { useCatalogStore } from './catalogStore';

export function emptyDesign(): Design {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: newId('d_'),
    name: 'Untitled rack',
    rack: { width: '19in', heightU: 12, depthMm: null, numbering: 'bottom-up' },
    expectedPoeLoadW: null,
    placements: [],
    cables: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Keep each shelf item's stored bottomU equal to its shelf's bottom U. Rendering
 * derives the position from the shelf anyway; this keeps saved/exported JSON
 * truthful after a shelf moves.
 */
function syncShelfChildren(placements: PlacedPart[]): PlacedPart[] {
  const { catalog } = useCatalogStore.getState();
  let changed = false;
  const out = placements.map((p) => {
    if (p.parentId === undefined) return p;
    const shelf = placements.find((q) => q.id === p.parentId);
    const shelfPart = shelf && catalog.get(shelf.partId);
    if (!shelf || !shelfPart) return p;
    // Items stand on the shelf's tray, at the shelf's own bottom U.
    if (p.bottomU === shelf.bottomU) return p;
    changed = true;
    return { ...p, bottomU: shelf.bottomU };
  });
  return changed ? out : placements;
}

export type PlacementPatch = Partial<Omit<PlacedPart, 'id' | 'partId'>>;

interface DesignState {
  design: Design;
  setName: (name: string) => void;
  /** Replace rack settings and the (already validated) placement list in one undo step. */
  setRack: (rack: Rack, placements: PlacedPart[]) => void;
  addPlacement: (p: PlacedPart) => void;
  updatePlacement: (id: string, patch: PlacementPatch) => void;
  /** Removes the placement and anything sitting on it. */
  removePlacement: (id: string) => void;
  setExpectedPoe: (w: number | null) => void;
  addCable: (c: Cable) => void;
  updateCable: (id: string, patch: Partial<Omit<Cable, 'id'>>) => void;
  removeCable: (id: string) => void;
  /** Replace the whole design (opening a design) and reset undo history. */
  loadDesign: (d: Design) => void;
}

const touch = (d: Design): Design => ({ ...d, updatedAt: new Date().toISOString() });

export const useDesignStore = create<DesignState>()(
  temporal(
    (set) => ({
      design: emptyDesign(),
      setName: (name) => set((s) => ({ design: touch({ ...s.design, name }) })),
      setRack: (rack, placements) =>
        set((s) => {
          const ids = new Set(placements.map((p) => p.id));
          const cables = s.design.cables.filter((c) => ids.has(c.a.placementId) && ids.has(c.b.placementId));
          return { design: touch({ ...s.design, rack, placements: syncShelfChildren(placements), cables }) };
        }),
      addPlacement: (p) => set((s) => ({ design: touch({ ...s.design, placements: [...s.design.placements, p] }) })),
      updatePlacement: (id, patch) =>
        set((s) => ({
          design: touch({
            ...s.design,
            placements: syncShelfChildren(s.design.placements.map((p) => {
              if (p.id !== id) return p;
              const next: PlacedPart = { ...p, ...patch };
              // Optional fields set to undefined are removed so the design stays schema-clean.
              for (const k of ['label', 'notes', 'color', 'parentId', 'measuredW'] as const) {
                if (k in patch && patch[k] === undefined) delete next[k];
              }
              return next;
            })),
          }),
        })),
      removePlacement: (id) =>
        set((s) => {
          const doomed = new Set([id]);
          let grew = true;
          while (grew) {
            grew = false;
            for (const p of s.design.placements) {
              if (p.parentId && doomed.has(p.parentId) && !doomed.has(p.id)) {
                doomed.add(p.id);
                grew = true;
              }
            }
          }
          return {
            design: touch({
              ...s.design,
              placements: s.design.placements.filter((p) => !doomed.has(p.id)),
              // Cables attached to removed devices go with them.
              cables: s.design.cables.filter((c) => !doomed.has(c.a.placementId) && !doomed.has(c.b.placementId)),
            }),
          };
        }),
      addCable: (c) => set((s) => ({ design: touch({ ...s.design, cables: [...s.design.cables, c] }) })),
      updateCable: (id, patch) =>
        set((s) => ({
          design: touch({
            ...s.design,
            cables: s.design.cables.map((c) => {
              if (c.id !== id) return c;
              const next: Cable = { ...c, ...patch };
              for (const k of ['label', 'lengthM'] as const) if (k in patch && patch[k] === undefined) delete next[k];
              return next;
            }),
          }),
        })),
      removeCable: (id) => set((s) => ({ design: touch({ ...s.design, cables: s.design.cables.filter((c) => c.id !== id) }) })),
      setExpectedPoe: (w) => set((s) => ({ design: touch({ ...s.design, expectedPoeLoadW: w }) })),
      loadDesign: (d) => {
        set({ design: { ...d, placements: syncShelfChildren(d.placements) } });
        useDesignStore.temporal.getState().clear();
      },
    }),
    {
      limit: 200,
      partialize: (s) => ({ design: s.design }),
      equality: (a, b) => a.design === b.design,
    },
  ),
);

export function useHistory() {
  const pastCount = useStore(useDesignStore.temporal, (s) => s.pastStates.length);
  const futureCount = useStore(useDesignStore.temporal, (s) => s.futureStates.length);
  const { undo, redo } = useDesignStore.temporal.getState();
  return { canUndo: pastCount > 0, canRedo: futureCount > 0, undo: () => undo(), redo: () => redo() };
}
