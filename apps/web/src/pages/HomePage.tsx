import {
  MAX_RACK_U,
  MIN_RACK_U,
  RACK_DEPTH_PRESETS,
  RACK_HEIGHT_PRESETS,
  computeStats,
  parseDesignImport,
  type Design,
  type RackWidth,
} from '@rackplanner/shared';
import { Copy, DatabaseBackup, MoreVertical, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RackView } from '../components/rack/RackView';
import { Badge, Button, Segmented, cx, inputClass, selectClass } from '../components/ui';
import {
  ApiError,
  createDesignApi,
  createPart,
  deleteDesignApi,
  duplicateDesignApi,
  listDesigns,
  saveDesignApi,
  type StoredDesign,
} from '../lib/api';
import { designPath, navigate } from '../lib/router';
import { toast } from '../lib/toast';
import { useCatalogStore } from '../store/catalogStore';
import { useUiStore, type Theme } from '../store/uiStore';

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString();
}

function NewDesignDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [width, setWidth] = useState<RackWidth>('19in');
  const [heightU, setHeightU] = useState(12);
  const [depth, setDepth] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);
  const create = async () => {
    setBusy(true);
    try {
      const { design } = await createDesignApi({ name: name.trim() || undefined, rack: { width, heightU, depthMm: depth } });
      navigate(designPath(design.id));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create design', 'error');
      setBusy(false);
    }
  };
  const heights = Array.from({ length: MAX_RACK_U - MIN_RACK_U + 1 }, (_, i) => i + MIN_RACK_U);
  return (
    <dialog
      ref={ref}
      aria-label="New rack design"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="space-y-4 p-5">
          <h2 className="text-lg font-semibold">New rack design</h2>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Name</span>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Office rack" autoFocus />
          </label>
          <div className="space-y-1">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Width</span>
            <div>
              <Segmented label="Rack width" value={width} onChange={setWidth} options={[{ value: '19in', label: '19″' }, { value: '10in', label: '10″' }]} />
            </div>
          </div>
          <div className="space-y-1">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Height</span>
            <div className="flex flex-wrap gap-1">
              {RACK_HEIGHT_PRESETS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setHeightU(u)}
                  className={cx(
                    'h-8 min-w-10 rounded-md border px-2 text-sm font-medium',
                    heightU === u ? 'border-blue-600 bg-blue-600 text-white' : 'border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800',
                  )}
                >
                  {u}U
                </button>
              ))}
              <select aria-label="Other height" className={selectClass} value={heightU} onChange={(e) => setHeightU(Number(e.target.value))}>
                {heights.map((u) => (
                  <option key={u} value={u}>
                    {u}U
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Depth (optional)</span>
            <select className={cx(selectClass, 'w-full')} value={depth ?? ''} onChange={(e) => setDepth(e.target.value ? Number(e.target.value) : null)}>
              <option value="">Not specified</option>
              {RACK_DEPTH_PRESETS.map((d) => (
                <option key={d} value={d}>
                  {d} mm
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" disabled={busy}>
            Create
          </Button>
        </div>
      </form>
    </dialog>
  );
}

function RenameDialog({ item, onClose, onDone }: { item: StoredDesign; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(item.design.name);
  const save = async () => {
    const v = name.trim();
    if (!v || v === item.design.name) return onClose();
    try {
      await saveDesignApi({ ...item.design, name: v }, item.revision);
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Rename failed', 'error');
      onClose();
    }
  };
  return (
    <ConfirmDialog title="Rename design" confirmLabel="Rename" onCancel={onClose} onConfirm={() => void save()}>
      <input
        aria-label="New name"
        className={inputClass}
        value={name}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void save()}
      />
    </ConfirmDialog>
  );
}

function DesignCard({ item, onChanged, onRename, onDelete }: { item: StoredDesign; onChanged: () => void; onRename: () => void; onDelete: () => void }) {
  const catalog = useCatalogStore((s) => s.catalog);
  const { design } = item;
  const [menu, setMenu] = useState(false);
  const stats = useMemo(() => computeStats(design, catalog), [design, catalog]);
  const errors = stats.warnings.filter((w) => w.severity === 'error').length;
  const duplicate = async () => {
    setMenu(false);
    try {
      await duplicateDesignApi(design.id);
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Duplicate failed', 'error');
    }
  };
  return (
    <li className="group relative flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900">
      <a
        href={designPath(design.id)}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.button !== 0) return;
          e.preventDefault();
          navigate(designPath(design.id));
        }}
        className="flex flex-1 flex-col focus-visible:outline-2 focus-visible:outline-blue-500"
        aria-label={`Open ${design.name}`}
      >
        <div className="flex h-52 items-center justify-center bg-zinc-100 p-3 dark:bg-zinc-950">
          <RackView design={design} catalog={catalog} view="front" cables={design.cables} lod="mid" className="h-full w-auto max-w-full" />
        </div>
        <div className="space-y-1 p-3">
          <div className="truncate pr-6 font-semibold">{design.name}</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {design.rack.heightU}U {design.rack.width === '19in' ? '19″' : '10″'} · {design.placements.length} device{design.placements.length === 1 ? '' : 's'} ·{' '}
            {stats.usedU}U used
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <span>Edited {timeAgo(design.updatedAt)}</span>
            {stats.power.maxW > 0 && <Badge>{Math.round(stats.power.maxW)} W max</Badge>}
            {errors > 0 && <Badge tone="amber">{errors} issue{errors === 1 ? '' : 's'}</Badge>}
          </div>
        </div>
      </a>
      <div className="absolute right-2 bottom-12">
        <Button aria-label={`Actions for ${design.name}`} aria-haspopup="menu" aria-expanded={menu} className="px-1.5" onClick={() => setMenu((m) => !m)}>
          <MoreVertical className="size-4" />
        </Button>
        {menu && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
            <div role="menu" className="absolute right-0 bottom-9 z-20 w-40 rounded-lg border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
              {[
                { label: 'Rename', icon: Pencil, act: () => (setMenu(false), onRename()) },
                { label: 'Duplicate', icon: Copy, act: () => void duplicate() },
                { label: 'Delete', icon: Trash2, act: () => (setMenu(false), onDelete()), danger: true },
              ].map(({ label, icon: Icon, act, danger }) => (
                <button
                  key={label}
                  type="button"
                  role="menuitem"
                  onClick={act}
                  className={cx(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800',
                    danger && 'text-red-600 dark:text-red-400',
                  )}
                >
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </li>
  );
}

export function HomePage() {
  const [items, setItems] = useState<StoredDesign[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<StoredDesign | null>(null);
  const [deleting, setDeleting] = useState<Design | null>(null);
  const { theme, setTheme } = useUiStore();

  const refresh = useCallback(() => {
    listDesigns().then(setItems, (e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(refresh, [refresh]);

  const remove = async () => {
    if (!deleting) return;
    const d = deleting;
    setDeleting(null);
    try {
      await deleteDesignApi(d.id);
      toast(`Deleted ${d.name}`);
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Delete failed', 'error');
    }
  };

  const nextTheme: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };
  const fileRef = useRef<HTMLInputElement>(null);

  /** Import an exported design (plus any custom parts it carries). */
  const importFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) return toast('That file is too large to be a design', 'error');
    const parsed = parseDesignImport(await file.text());
    if (!parsed.ok) return toast(parsed.error, 'error');
    const { catalog, upsert } = useCatalogStore.getState();
    try {
      for (const part of parsed.customParts) {
        if (catalog.has(part.id)) continue;
        try {
          upsert(await createPart(part));
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 409)) throw e;
        }
      }
      const { design } = await createDesignApi({ design: parsed.design });
      const missing = new Set(design.placements.map((p) => p.partId).filter((id) => !useCatalogStore.getState().catalog.has(id)));
      toast(missing.size ? `Imported, but ${missing.size} part type(s) aren't in this catalog` : `Imported ${design.name}`, missing.size ? 'error' : 'info');
      navigate(designPath(design.id));
    } catch (e) {
      toast(e instanceof Error ? `Import failed: ${e.message}` : 'Import failed', 'error');
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-7" />
          <h1 className="text-lg font-semibold tracking-tight">RackPlanner</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setTheme(nextTheme[theme])} title={`Theme: ${theme}`} className="max-sm:hidden">
            Theme: {theme}
          </Button>
          <a
            href="/api/backup"
            download
            title="Download a backup of all designs and custom parts"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <DatabaseBackup className="size-4" /> <span className="max-sm:hidden">Backup</span>
          </a>
          <Button onClick={() => fileRef.current?.click()} title="Import a design exported as JSON">
            <Upload className="size-4" /> <span className="max-sm:hidden">Import</span>
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            aria-label="Import design file"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void importFile(f);
            }}
          />
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus className="size-4" /> New design
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        {error && <p className="text-sm text-red-600">Couldn't load designs: {error}</p>}
        {items === null && !error && <p className="text-sm text-zinc-500">Loading designs…</p>}
        {items?.length === 0 && (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <h2 className="mb-2 text-xl font-semibold">Plan your first rack</h2>
            <p className="mb-5 text-sm text-zinc-500">Pick a rack size, then drag gear in from the catalog. Designs save automatically.</p>
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New design
            </Button>
          </div>
        )}
        {items && items.length > 0 && (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <li>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex h-full min-h-72 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-500 hover:border-blue-500 hover:text-blue-600 dark:border-zinc-700"
              >
                <Plus className="size-6" />
                <span className="font-medium">New design</span>
              </button>
            </li>
            {items.map((item) => (
              <DesignCard key={item.design.id} item={item} onChanged={refresh} onRename={() => setRenaming(item)} onDelete={() => setDeleting(item.design)} />
            ))}
          </ul>
        )}
      </div>

      {creating && <NewDesignDialog onClose={() => setCreating(false)} />}
      {renaming && (
        <RenameDialog
          item={renaming}
          onClose={() => setRenaming(null)}
          onDone={() => {
            setRenaming(null);
            refresh();
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog title={`Delete ${deleting.name}?`} confirmLabel="Delete design" onCancel={() => setDeleting(null)} onConfirm={() => void remove()}>
          <p>This permanently deletes the design. It can't be undone.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
