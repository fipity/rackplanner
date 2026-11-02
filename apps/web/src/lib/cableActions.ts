import { CABLE_COLORS, guessCableType, newId, sameEnd, type CableEnd } from '@rackplanner/shared';
import { useDesignStore } from '../store/designStore';
import { useUiStore } from '../store/uiStore';
import { toast } from './toast';

/** Cable mode click on a port or device: first click starts, second finishes. */
export function handleCableEndClick(end: CableEnd): void {
  const ui = useUiStore.getState();
  const pending = ui.pendingEnd;
  if (!pending) {
    ui.setPendingEnd(end);
    return;
  }
  if (sameEnd(pending, end)) {
    ui.setPendingEnd(null);
    return;
  }
  if (pending.placementId === end.placementId && (!pending.port || !end.port)) {
    toast('Pick a different device, or two ports on this one', 'error');
    return;
  }
  const type = guessCableType(pending, end);
  const id = newId('c_');
  useDesignStore.getState().addCable({ id, a: pending, b: end, type, color: CABLE_COLORS[type] });
  ui.setPendingEnd(null);
  ui.selectCable(id);
}
