import { useEffect } from 'react';
import { useDesignStore } from '../store/designStore';
import { useUiStore } from '../store/uiStore';
import { deleteSelected, duplicateSelected, nudgeSelected } from './actions';

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
      } else if (!mod && e.key === 'ArrowUp') {
        e.preventDefault();
        nudgeSelected(1);
      } else if (!mod && e.key === 'ArrowDown') {
        e.preventDefault();
        nudgeSelected(-1);
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
      } else if (!mod && (e.key === '+' || e.key === '=')) {
        useUiStore.getState().zoomBy(1.2);
      } else if (!mod && e.key === '-') {
        useUiStore.getState().zoomBy(1 / 1.2);
      } else if (!mod && key === '0') {
        useUiStore.getState().setZoom('fit');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
