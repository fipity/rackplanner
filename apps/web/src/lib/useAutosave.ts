/**
 * Debounced autosave of the open design. Every design change schedules a
 * PUT with the last known revision. A 409 (edited elsewhere) pauses saving
 * and lets the user choose; network errors retry with backoff.
 */
import type { Design } from '@rackplanner/shared';
import { useEffect } from 'react';
import { useDesignStore } from '../store/designStore';
import { useSaveStore } from '../store/saveStore';
import { ApiError, saveDesignApi, saveDesignOnUnload } from './api';

const DEBOUNCE_MS = 700;

let saveNow: ((force?: boolean) => Promise<void>) | null = null;

/** Force-save the current design (used by "Keep my version" after a conflict). */
export function forceSave(): Promise<void> {
  return saveNow?.(true) ?? Promise.resolve();
}

export function useAutosave(designId: string | null): void {
  useEffect(() => {
    if (!designId) return;
    let lastSaved: Design = useDesignStore.getState().design;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    let queued = false;
    let retryMs = 2000;
    let disposed = false;
    const save = useSaveStore.getState().set;

    const run = async (force = false): Promise<void> => {
      const design = useDesignStore.getState().design;
      if (design.id !== designId || disposed) return;
      if (design === lastSaved && !force) {
        save({ status: 'saved' });
        return;
      }
      if (useSaveStore.getState().status === 'conflict' && !force) return;
      if (inFlight) {
        queued = true;
        return;
      }
      inFlight = true;
      save({ status: 'saving' });
      try {
        const res = await saveDesignApi(design, useSaveStore.getState().revision, force);
        lastSaved = design;
        retryMs = 2000;
        const dirty = useDesignStore.getState().design !== design;
        save({ revision: res.revision, status: dirty ? 'pending' : 'saved', error: null, lastSavedAt: Date.now() });
        if (dirty) queued = true;
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          save({ status: 'conflict', error: err.message });
        } else {
          save({ status: 'error', error: err instanceof Error ? err.message : 'Save failed' });
          clearTimeout(timer);
          timer = setTimeout(() => void run(), retryMs);
          retryMs = Math.min(retryMs * 2, 30000);
        }
      } finally {
        inFlight = false;
        if (queued && !disposed) {
          queued = false;
          void run();
        }
      }
    };
    saveNow = run;

    const unsub = useDesignStore.subscribe((state, prev) => {
      if (state.design === prev.design || state.design === lastSaved || state.design.id !== designId) return;
      if (useSaveStore.getState().status !== 'conflict') save({ status: 'pending' });
      clearTimeout(timer);
      timer = setTimeout(() => void run(), DEBOUNCE_MS);
    });

    const onUnload = () => {
      const design = useDesignStore.getState().design;
      if (design !== lastSaved && design.id === designId && useSaveStore.getState().status !== 'conflict') {
        saveDesignOnUnload(design, useSaveStore.getState().revision);
      }
    };
    window.addEventListener('pagehide', onUnload);

    return () => {
      disposed = true;
      unsub();
      window.removeEventListener('pagehide', onUnload);
      clearTimeout(timer);
      // Flush on leaving the editor (e.g. back to the home screen).
      const design = useDesignStore.getState().design;
      if (design !== lastSaved && design.id === designId && useSaveStore.getState().status !== 'conflict') {
        void saveDesignApi(design, useSaveStore.getState().revision).then(
          (r) => useSaveStore.getState().set({ revision: r.revision, status: 'saved' }),
          () => undefined,
        );
      }
      if (saveNow === run) saveNow = null;
    };
  }, [designId]);
}
