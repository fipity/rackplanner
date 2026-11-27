/** The "?" popup: every keyboard, mouse, trackpad and touch control in the editor. */
import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useUiStore, type WheelMode } from '../store/uiStore';
import { Button, Segmented } from './ui';

export const SHORTCUT_GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Move around',
    items: [
      ['Drag empty space', 'pan'],
      ['Space + drag', 'pan from anywhere, even over a device'],
      ['Middle or right drag', 'pan'],
      ['Two-finger trackpad scroll', 'pan in any direction'],
      ['Shift + mouse wheel', 'pan sideways'],
      ['Arrow keys', 'pan when nothing is selected (Shift: faster)'],
      ['One finger on empty space', 'pan (touch)'],
      ['Two-finger pinch', 'zoom and pan (touch)'],
    ],
  },
  {
    title: 'Zoom',
    items: [
      ['Mouse wheel', 'zoom at the cursor'],
      ['Ctrl/⌘ + wheel, trackpad pinch', 'zoom at the cursor'],
      ['+ / −', 'zoom in / out around the centre'],
      ['F or Shift+1', 'fit the rack to the screen'],
      ['Shift+2', 'zoom to the selected device'],
      ['0 or Ctrl+0', 'reset to 100%, centred'],
      ['Click the zoom %', 'type a zoom level (10–800%)'],
    ],
  },
  {
    title: 'Edit',
    items: [
      ['Drag / click', 'add from the catalog'],
      ['↑ / ↓', 'move the selected device 1U'],
      ['Del', 'remove'],
      ['Ctrl+D', 'duplicate'],
      ['Ctrl+Z / Ctrl+Shift+Z', 'undo / redo'],
      ['C', 'cable mode'],
      ['R', 'reverse: face the other way (front ↔ rear)'],
      ['T', 'turn a shelf device on its side'],
      ['Shift / Ctrl + click', 'select more than one'],
      ['Right-click', 'part menu (reverse, turn, duplicate, remove)'],
      ['Esc', 'cancel / deselect'],
      ['?', 'this list'],
    ],
  },
];

export function ShortcutsDialog() {
  const open = useUiStore((s) => s.shortcutsOpen);
  const close = () => useUiStore.getState().setShortcutsOpen(false);
  const wheelMode = useUiStore((s) => s.wheelMode);
  const setWheelMode = useUiStore((s) => s.setWheelMode);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (open && d && !d.open) d.showModal();
    if (!open && d?.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-label="Shortcuts"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => e.target === e.currentTarget && close()}
      className="m-auto max-h-[calc(100vh-2rem)] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      {open && (
        <div className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Shortcuts</h2>
            <Button aria-label="Close" onClick={close} className="px-1.5">
              <X className="size-4" />
            </Button>
          </div>
          <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Scroll wheel:</span>
            <Segmented<WheelMode>
              label="Scroll wheel"
              value={wheelMode}
              onChange={setWheelMode}
              options={[
                { value: 'auto', label: 'Auto', title: 'A mouse wheel zooms; two-finger trackpad scrolling pans' },
                { value: 'zoom', label: 'Always zoom', title: 'Every scroll zooms, trackpads too' },
                { value: 'pan', label: 'Pan', title: 'Scrolling pans; hold Ctrl to zoom' },
              ]}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {SHORTCUT_GROUPS.map((g) => (
              <section key={g.title} className={g.title === 'Edit' ? 'sm:col-span-2' : undefined}>
                <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{g.title}</h3>
                <dl className="space-y-1 text-sm">
                  {g.items.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt>
                        <kbd className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">{k}</kbd>
                      </dt>
                      <dd className="text-right text-zinc-600 dark:text-zinc-400">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>
        </div>
      )}
    </dialog>
  );
}
