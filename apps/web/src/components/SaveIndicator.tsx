import { AlertTriangle, Check, CloudOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { getDesign } from '../lib/api';
import { toast } from '../lib/toast';
import { forceSave } from '../lib/useAutosave';
import { useDesignStore } from '../store/designStore';
import { useSaveStore } from '../store/saveStore';
import { ConfirmDialog } from './ConfirmDialog';
import { cx } from './ui';

export function SaveIndicator() {
  const { status, error, designId } = useSaveStore();
  const [resolving, setResolving] = useState(false);

  const loadLatest = async () => {
    if (!designId) return;
    setResolving(false);
    try {
      const fresh = await getDesign(designId);
      useDesignStore.getState().loadDesign(fresh.design);
      useSaveStore.getState().init(designId, fresh.revision);
      toast('Loaded the latest version');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Reload failed', 'error');
    }
  };

  const content = {
    idle: null,
    saved: (
      <>
        <Check className="size-3.5" /> Saved
      </>
    ),
    pending: <>Unsaved changes…</>,
    saving: (
      <>
        <Loader2 className="size-3.5 animate-spin" /> Saving…
      </>
    ),
    error: (
      <>
        <CloudOff className="size-3.5" /> Offline, retrying
      </>
    ),
    conflict: (
      <>
        <AlertTriangle className="size-3.5" /> Changed elsewhere
      </>
    ),
  }[status];

  return (
    <>
      <button
        type="button"
        onClick={() => status === 'conflict' && setResolving(true)}
        title={error ?? undefined}
        aria-live="polite"
        className={cx(
          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs',
          status === 'conflict' ? 'bg-amber-100 font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'cursor-default text-zinc-500',
          status === 'error' && 'text-red-600 dark:text-red-400',
        )}
      >
        {content}
      </button>
      {resolving && (
        <ConfirmDialog
          title="This design was changed elsewhere"
          confirmLabel="Keep my version"
          onCancel={() => void loadLatest()}
          onConfirm={() => {
            setResolving(false);
            void forceSave();
          }}
        >
          <p>Another tab or device saved this design after you opened it.</p>
          <p className="mt-2">
            <strong>Keep my version</strong> overwrites it with what you see now. <strong>Cancel</strong> discards your unsaved changes and loads the latest version.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}
