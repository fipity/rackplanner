import { displayName, mountChildren } from '@rackplanner/shared';
import { useEffect, useRef } from 'react';
import { removeMount } from '../lib/actions';
import { useCatalogStore } from '../store/catalogStore';
import { useDesignStore } from '../store/designStore';
import { useUiStore } from '../store/uiStore';
import { Button } from './ui';

/** Removing a 3D-printed mount that holds devices: keep them or remove them too. */
export function MountRemovalDialog() {
  const pending = useUiStore((s) => s.mountRemoval);
  const design = useDesignStore((s) => s.design);
  const catalog = useCatalogStore((s) => s.catalog);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const mount = pending && design.placements.find((p) => p.id === pending.placementId);
  if (!pending || !mount) return null;
  const kids = mountChildren(design, mount.id, catalog);
  const names = kids.map((k) => displayName(k, catalog.get(k.partId)));
  const cancel = () => useUiStore.getState().setMountRemoval(null);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
      aria-label="Remove mount"
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="p-5">
        <h2 className="mb-3 text-lg font-semibold">Remove {displayName(mount, catalog.get(mount.partId))}?</h2>
        <p className="text-sm">
          It holds {names.join(', ')}. Keep {kids.length === 1 ? 'it' : 'them'} in the design (moved onto the nearest free shelf, or into free rack space), or remove{' '}
          {kids.length === 1 ? 'both' : 'everything'}?
        </p>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <Button onClick={cancel}>Cancel</Button>
        <Button variant="danger" onClick={() => removeMount(mount.id, false)} className="border border-red-200 dark:border-red-900">
          Remove both
        </Button>
        <Button variant="primary" onClick={() => removeMount(mount.id, true)} autoFocus>
          Keep the device{kids.length === 1 ? '' : 's'}
        </Button>
      </div>
    </dialog>
  );
}
