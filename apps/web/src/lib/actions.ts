/** Editor commands shared by keyboard shortcuts, toolbar and inspector. */
import {
  applyRackChange,
  checkPlacement,
  findFreeSlot,
  findShelfSlot,
  newId,
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
  const slot =
    (part.formFactor === 'desktop' ? findShelfSlot(design, catalog, p.partId, p.parentId) : null) ??
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
