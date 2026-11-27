import { useEffect } from 'react';
import { useDesignStore } from '../store/designStore';
import { useUiStore } from '../store/uiStore';
import { deleteSelected, duplicateSelected, nudgeSelected, reverseSelected, turnSelected } from './actions';
import { fitToScreen, panView, resetView, zoomAround, zoomToSelection } from '../store/viewStore';

/** Arrow-key pan step (px), and with Shift. */
const PAN_STEP = 60;
const PAN_STEP_FAST = 240;

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const { undo, redo } = useDesignStore.temporal.getState();

      if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        duplicateSelected();
      } else if (!mod && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        const cableId = useUiStore.getState().selectedCableId;
        if (cableId) {
          useDesignStore.getState().removeCable(cableId);
          useUiStore.getState().selectCable(null);
        } else deleteSelected();
      } else if (!mod && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const ui = useUiStore.getState();
        if (ui.selectedId) {
          // A selected device moves (up / down), as before.
          if (e.key === 'ArrowUp') nudgeSelected(1);
          else if (e.key === 'ArrowDown') nudgeSelected(-1);
        } else if (!ui.selectedCableId && !ui.plan) {
          const step = e.shiftKey ? PAN_STEP_FAST : PAN_STEP;
          const d = { ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [step, 0], ArrowRight: [-step, 0] }[e.key];
          if (d) panView(d[0]!, d[1]!);
        }
      } else if (e.key === 'Escape') {
        const ui = useUiStore.getState();
        if (ui.pendingEnd) ui.setPendingEnd(null);
        else if (ui.cableMode) ui.setCableMode(false);
        else {
          ui.select(null);
          ui.selectCable(null);
        }
      } else if (!mod && key === 'c') {
        const ui = useUiStore.getState();
        ui.setCableMode(!ui.cableMode);
      } else if (!mod && !e.altKey && key === 'r') {
        reverseSelected();
      } else if (!mod && !e.altKey && key === 't') {
        turnSelected();
      } else if (!mod && (e.key === '+' || e.key === '=')) {
        zoomAround(1.25);
      } else if (!mod && (e.key === '-' || e.key === '_')) {
        zoomAround(1 / 1.25);
      } else if (e.code === 'Digit0' || e.code === 'Numpad0') {
        // 0 or Ctrl+0: 100%, centred (instead of the browser's page zoom reset).
        e.preventDefault();
        resetView();
      } else if (!mod && ((key === 'f' && !e.shiftKey) || (e.shiftKey && e.code === 'Digit1'))) {
        e.preventDefault();
        fitToScreen();
      } else if (!mod && e.shiftKey && e.code === 'Digit2') {
        e.preventDefault();
        zoomToSelection();
      } else if (!mod && e.key === '?') {
        e.preventDefault();
        useUiStore.getState().setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
