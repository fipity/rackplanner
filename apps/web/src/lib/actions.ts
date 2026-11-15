/** Editor commands shared by keyboard shortcuts, toolbar and inspector. */
import {
  applyRackChange,
  checkPlacement,
  findFreeSlot,
  findShelfSlot,
  findWallSlot,
  newId,
  partWidthMm,
  shelfGeometry,
  shelfXCandidates,
  turnedPart,
  uprightPart,
  uStep,
  type Rack,
  type RackChangeResult,
} from '@rackplanner/shared';
import { useCatalogStore } from '../store/catalogStore';
import { useDesignStore } from '../store/designStore';
import { useUiStore } from '../store/uiStore';
import { toast } from './toast';

function selected() {
  const id = useUiStore.getState().selectedId;
  const { design } = useDesignStore.getState();
  return id ? design.placements.find((p) => p.id === id) : undefined;
}

export function deleteSelected(): void {
  const p = selected();
  if (!p) return;
  useDesignStore.getState().removePlacement(p.id);
  useUiStore.getState().select(null);
}

export function duplicateSelected(): void {
  const p = selected();
  if (!p) return;
  const { design, addPlacement } = useDesignStore.getState();
  const { catalog } = useCatalogStore.getState();
  const part = catalog.get(p.partId);
  if (!part) return;
  const mounting = p.parentId !== undefined ? (part.mounting === 'full-depth' ? 'full-depth' : 'front') : p.mounting;
  // Shelf items are duplicated onto the same shelf (or another) when there's room.
  const slot = p.wall
    ? findWallSlot(design, catalog, p.partId, p.bottomU)
    : (part.formFactor === 'desktop' ? findShelfSlot(design, catalog, p.partId, p.parentId) : null) ??
      findFreeSlot(design, catalog, p.partId, mounting, p.bottomU + part.heightU);
  if (!slot) {
    toast(`No free space for another ${part.name}`, 'error');
    return;
  }
  const copy = { ...slot, id: newId('p_') };
  if (p.label) copy.label = `${p.label} copy`;
  if (p.notes) copy.notes = p.notes;
  if (p.color) copy.color = p.color;
  addPlacement(copy);
  useUiStore.getState().select(copy.id);
}

/** Move the selected part up (+1) or down (-1) by one grid step. */
export function nudgeSelected(dir: 1 | -1): void {
  const p = selected();
  if (!p || p.parentId !== undefined) return;
  const { design, updatePlacement } = useDesignStore.getState();
  const { catalog } = useCatalogStore.getState();
  const part = catalog.get(p.partId);
  if (!part) return;
  const candidate = { ...p, bottomU: p.bottomU + dir * uStep(part) };
  const check = checkPlacement(design, candidate, catalog);
  if (check.ok) {
    updatePlacement(p.id, { bottomU: candidate.bottomU });
  } else {
    toast(check.problems[0]?.message ?? 'Cannot move there', 'error');
  }
}

/** Lay the selected shelf device on its side, or stand it back up (R). */
export function turnSelected(): void {
  const p = selected();
  if (!p) return;
  const { design, updatePlacement } = useDesignStore.getState();
  const { catalog } = useCatalogStore.getState();
  const part = catalog.get(p.partId);
  if (!part) return;
  const upright = uprightPart(part);
  const next = upright ?? turnedPart(part);
  if (!next) {
    if (part.formFactor === 'desktop') toast(`${part.name} can't be turned on its side`, 'error');
    return;
  }
  // On a shelf, keep the device centred where it was, inside the usable width.
  const shelf = p.parentId ? design.placements.find((s) => s.id === p.parentId) : undefined;
  const geo = shelf ? shelfGeometry(design.placements, shelf, catalog) : null;
  const w = partWidthMm(next);
  let xMm = p.xMm;
  if (geo) xMm = Math.min(Math.max(0, p.xMm + (partWidthMm(part) - w) / 2), Math.max(0, geo.usableWidthMm - w));
  let check = checkPlacement(design, { ...p, partId: next.id, xMm }, catalog);
  if (!check.ok && geo) {
    // Try the nearest free spot on the same shelf.
    for (const x of shelfXCandidates(design.placements, geo, next, catalog, [p.id]).sort((a, b) => Math.abs(a - xMm) - Math.abs(b - xMm))) {
      const c = checkPlacement(design, { ...p, partId: next.id, xMm: x }, catalog);
      if (c.ok) {
        xMm = x;
        check = c;
        break;
      }
    }
  }
  if (!check.ok) {
    toast(check.problems[0]?.message ?? `No room to turn ${part.name}`, 'error');
    return;
  }
  updatePlacement(p.id, { partId: next.id, xMm });
}

/** Preview a rack change without applying it. */
export function previewRackChange(rack: Rack): RackChangeResult {
  const { design } = useDesignStore.getState();
  return applyRackChange(design, rack, useCatalogStore.getState().catalog);
}

export function commitRackChange(rack: Rack, result: RackChangeResult): void {
  useDesignStore.getState().setRack(rack, result.placements);
  const sel = useUiStore.getState().selectedId;
  if (sel && !result.placements.some((p) => p.id === sel)) useUiStore.getState().select(null);
}

/** Turn the wall area on (keeping everything in the rack as it is). */
export function ensureWall(): void {
  const { design, setRack } = useDesignStore.getState();
  if (!design.rack.wall) setRack({ ...design.rack, wall: true }, design.placements);
}

/** Move the selected device onto the wall beside the rack, turning the wall on if needed. */
export function moveSelectedToWall(): void {
  const p = selected();
  if (!p || p.wall) return;
  const { catalog } = useCatalogStore.getState();
  const part = catalog.get(p.partId);
  if (!part) return;
  ensureWall();
  const { design, updatePlacement } = useDesignStore.getState();
  // Whatever stands on it can't come along.
  if (design.placements.some((q) => q.parentId === p.id)) {
    toast(`Take the gear off ${part.name} first`, 'error');
    return;
  }
  const slot = findWallSlot({ ...design, placements: design.placements.filter((q) => q.id !== p.id) }, catalog, p.partId, p.bottomU);
  if (!slot) {
    toast(`No room on the wall for ${part.name}`, 'error');
    return;
  }
  updatePlacement(p.id, { bottomU: slot.bottomU, xMm: slot.xMm, mounting: 'front', parentId: undefined, wall: true });
}

/** Move the selected wall device back into the rack (onto a shelf if it's desktop gear). */
export function moveSelectedIntoRack(): void {
  const p = selected();
  if (!p || !p.wall) return;
  const { design, updatePlacement } = useDesignStore.getState();
  const { catalog } = useCatalogStore.getState();
  const part = catalog.get(p.partId);
  if (!part) return;
  const others = { ...design, placements: design.placements.filter((q) => q.id !== p.id) };
  const slot = findShelfSlot(others, catalog, p.partId) ?? findFreeSlot(others, catalog, p.partId, 'front');
  if (!slot) {
    toast(`No room in the rack for ${part.name}`, 'error');
    return;
  }
  updatePlacement(p.id, { bottomU: slot.bottomU, xMm: slot.xMm, mounting: slot.mounting, parentId: slot.parentId, wall: undefined });
  if (slot.parentId) toast('Placed on shelf');
}
