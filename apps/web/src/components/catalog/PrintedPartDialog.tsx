/**
 * "Add 3D-printed part": paste a MakerWorld link, the server reads the model
 * page once (or can't: MakerWorld often blocks scripts), and everything we
 * could fetch or guess goes into an editable form before it's saved as a
 * custom catalog part tagged 3d-printed.
 */
import {
  DEFAULT_FILAMENT,
  PRINTED_KIND_LABELS,
  PRINTED_KINDS,
  PRINT_STATUSES,
  PRINT_STATUS_LABELS,
  PartSchema,
  canBeHeld,
  guessPrinted,
  licenceInfo,
  parseModelUrl,
  printedPartFromForm,
  slugToTitle,
  type DeviceMatch,
  type HeldDevice,
  type Part,
  type PrintStatus,
  type PrintedKind,
  type PrintedSource,
} from '@rackplanner/shared';
import { AlertTriangle, ExternalLink, ImagePlus, Link2, Loader2, Plus, Printer, RefreshCw, Trash2, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError, createPart, resolvePrinted, thumbnailUrl, updatePart, uploadThumbnail, type ResolvedModel } from '../../lib/api';
import { toast } from '../../lib/toast';
import { useCatalogStore } from '../../store/catalogStore';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { PartThumb } from '../faceplates/PartThumb';
import { Button, cx, inputClass, selectClass } from '../ui';
import { addToRack } from './CatalogSidebar';

const U_OPTIONS = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8];

interface Form {
  url: string;
  name: string;
  kind: PrintedKind;
  heightU: number;
  /** U height was a default, not read from the title: highlighted until changed. */
  heightGuessed: boolean;
  rackWidth: '10in' | '19in';
  depthMm: string;
  mounting: 'front' | 'rear';
  filament: string;
  status: PrintStatus;
  notes: string;
  holds: HeldDevice[];
  /** The device match came from the title: ask to confirm it. */
  holdsSuggested: boolean;
  source: PrintedSource;
  thumbnail: string | null;
  slug: string | null;
  /** Details came from the page (false: from the link only). */
  fetched: boolean;
  reason: string | null;
}

function Field({ label, children, className, hint }: { label: ReactNode; children: (id: string) => ReactNode; className?: string; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className={cx('space-y-1', className)}>
      <label htmlFor={id} className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      {children(id)}
      {hint && <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{hint}</div>}
    </div>
  );
}

function fromPart(part: Part): Form {
  const p = part.printed!;
  return {
    url: p.source.url,
    name: part.name,
    kind: p.kind,
    heightU: part.heightU,
    heightGuessed: false,
    rackWidth: part.width === '19in' ? '19in' : '10in',
    depthMm: part.depthMm !== null ? String(part.depthMm) : '',
    mounting: part.mounting === 'rear' ? 'rear' : 'front',
    filament: p.filament,
    status: p.status,
    notes: part.notes ?? '',
    holds: p.holds,
    holdsSuggested: false,
    source: p.source,
    thumbnail: p.thumbnail,
    slug: null,
    fetched: p.source.fetchedAt !== null,
    reason: null,
  };
}

function fromResolved(r: ResolvedModel, parts: readonly Part[], rackWidth: '10in' | '19in'): Form {
  const d = r.details;
  const guess = guessPrinted({ title: d?.title ?? null, slug: r.parsed.slug, description: d?.description ?? null }, parts);
  const best: DeviceMatch | undefined = guess.matches[0];
  const holds = guess.kind === 'rackmount' && best ? [{ partId: best.part.id, qty: guess.quantity }] : [];
  return {
    url: r.parsed.canonicalUrl,
    name: guess.name,
    kind: guess.kind,
    heightU: guess.heightU,
    heightGuessed: !guess.heightFound,
    rackWidth: guess.rackWidth ?? rackWidth,
    depthMm: '',
    mounting: 'front',
    filament: DEFAULT_FILAMENT,
    status: 'planned',
    notes: '',
    holds,
    holdsSuggested: holds.length > 0,
    source: {
      site: r.parsed.site,
      modelId: r.parsed.modelId,
      profileId: r.parsed.profileId,
      url: r.parsed.canonicalUrl,
      title: d?.title ?? null,
      designer: d?.designer ?? null,
      designerUrl: d?.designerUrl ?? null,
      licence: d?.licence ?? null,
      profileName: d?.profileName ?? null,
      description: d?.description ?? null,
      fetchedAt: r.fetched ? r.fetchedAt : null,
    },
    thumbnail: r.thumbnail,
    slug: r.parsed.slug,
    fetched: r.fetched,
    reason: r.reason,
  };
}

/** The link alone (server unreachable): parse it in the browser. */
function offlineResolved(url: string, reason: string): ResolvedModel | null {
  const r = parseModelUrl(url);
  if (!r.ok) return null;
  return { parsed: r.parsed, details: null, thumbnail: null, fetched: false, reason, fetchedAt: new Date().toISOString(), cached: false };
}

async function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
}

export function PrintedPartDialog() {
  const state = useUiStore((s) => s.printedDialog);
  const close = () => useUiStore.getState().openPrinted(null);
  const parts = useCatalogStore((s) => s.parts);
  const catalog = useCatalogStore((s) => s.catalog);
  const rackWidth = useDesignStore((s) => s.design.rack.width);
  const editing = state?.mode === 'edit' ? catalog.get(state.partId) : undefined;

  const [link, setLink] = useState(state?.mode === 'create' ? (state.url ?? '') : '');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [busy, setBusy] = useState<false | 'resolve' | 'refresh' | 'save' | 'image'>(false);
  const [form, setForm] = useState<Form | null>(() => (editing?.printed ? fromPart(editing) : null));
  const ref = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) dlg.showModal();
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setSource = <K extends keyof PrintedSource>(k: K, v: PrintedSource[K]) => setForm((f) => (f ? { ...f, source: { ...f.source, [k]: v } } : f));

  const resolve = async () => {
    const parsed = parseModelUrl(link);
    if (!parsed.ok) {
      setLinkError(parsed.error);
      return;
    }
    setLinkError(null);
    setBusy('resolve');
    try {
      setForm(fromResolved(await resolvePrinted(link), parts, rackWidth));
    } catch (e) {
      if (e instanceof ApiError && e.status === 400) {
        setLinkError(e.message);
      } else {
        // Server unreachable or rate-limited: carry on from the link itself.
        const r = offlineResolved(link, e instanceof ApiError && e.status === 429 ? e.message : 'Couldn’t reach the RackPlanner server');
        if (r) setForm(fromResolved(r, parts, rackWidth));
      }
    } finally {
      setBusy(false);
    }
  };

  const refresh = async () => {
    if (!form) return;
    setBusy('refresh');
    try {
      const r = await resolvePrinted(form.source.url, true);
      if (!r.fetched || !r.details) {
        set('reason', r.reason);
        toast(`Still couldn’t fetch the details${r.reason ? `: ${r.reason}` : ''}`, 'error');
        return;
      }
      const d = r.details;
      setForm((f) =>
        f && {
          ...f,
          fetched: true,
          reason: null,
          // The name follows the fetched title unless it was edited.
          name: f.name === (f.source.title ?? slugToTitle(f.slug)) && d.title ? d.title : f.name,
          thumbnail: r.thumbnail ?? f.thumbnail,
          source: {
            ...f.source,
            title: d.title ?? f.source.title,
            designer: d.designer ?? f.source.designer,
            designerUrl: d.designerUrl ?? f.source.designerUrl,
            licence: d.licence ?? f.source.licence,
            profileName: d.profileName ?? f.source.profileName,
            description: d.description ?? f.source.description,
            fetchedAt: r.fetchedAt,
          },
        },
      );
      toast('Details updated from MakerWorld');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Refresh failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const takeImage = async (blob: Blob) => {
    if (blob.size > 5 * 1024 * 1024) {
      toast('Images must be 5 MB or smaller', 'error');
      return;
    }
    setBusy('image');
    try {
      set('thumbnail', await uploadThumbnail(await fileToDataUrl(blob)));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Couldn’t use that image', 'error');
    } finally {
      setBusy(false);
    }
  };

  const onPaste = (e: React.ClipboardEvent) => {
    if (!form) return;
    const item = [...e.clipboardData.items].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (file) {
      e.preventDefault();
      void takeImage(file);
    }
  };

  const holdable = useMemo(() => parts.filter((p) => canBeHeld(p) && !useCatalogStore.getState().retired.has(p.id)).sort((a, b) => a.name.localeCompare(b.name)), [parts]);
  const suggestions = useMemo(() => (form ? guessPrinted({ title: form.name, slug: form.slug, description: null }, parts).matches : []), [form?.name, form?.slug, parts]); // eslint-disable-line react-hooks/exhaustive-deps

  const built = useMemo(() => {
    if (!form) return null;
    const depth = form.depthMm.trim() ? Number(form.depthMm) : null;
    const input = printedPartFromForm(
      {
        name: form.name,
        kind: form.kind,
        heightU: form.heightU,
        rackWidth: form.rackWidth,
        depthMm: depth !== null && Number.isFinite(depth) && depth > 0 ? depth : null,
        mounting: form.mounting,
        filament: form.filament,
        status: form.status,
        notes: form.notes,
        holds: form.holds,
        source: { ...form.source, designerUrl: form.source.designerUrl?.trim() || null },
        thumbnail: form.thumbnail,
      },
      catalog,
    );
    const r = PartSchema.safeParse({ ...input, id: editing?.id ?? 'custom-preview' });
    return { input, part: r.success ? r.data : null, error: r.success ? null : r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)[0] };
  }, [form, catalog, editing?.id]);

  const save = async (place: boolean) => {
    if (!built?.part || !form?.name.trim()) return;
    setBusy('save');
    try {
      const { id: _id, ...input } = built.input;
      const part = editing ? await updatePart(editing.id, input) : await createPart(input);
      useCatalogStore.getState().upsert(part);
      close();
      if (place) addToRack(part);
      else toast(editing ? `Saved ${part.name}` : `Added ${part.name} to your catalog (3D printed)`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const lic = licenceInfo(form?.source.licence);
  const title = editing ? `Edit ${editing.name}` : 'Add 3D-printed part';
  const input = inputClass;
  const select = cx(selectClass, 'w-full');

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onPaste={onPaste}
      aria-label={title}
      className="m-auto flex max-h-[min(54rem,calc(100vh-2rem))] w-[min(46rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/40 open:flex dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Printer className="size-5" /> {title}
        </h2>
        <Button aria-label="Close" onClick={close} className="px-1.5">
          <X className="size-4" />
        </Button>
      </header>

      {!form ? (
        <form
          className="space-y-3 px-5 py-5"
          onSubmit={(e) => {
            e.preventDefault();
            void resolve();
          }}
        >
          <Field label="MakerWorld model link">
            {(id) => (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Link2 className="pointer-events-none absolute top-2 left-2 size-4 text-zinc-400" />
                  <input
                    id={id}
                    autoFocus
                    className={cx(input, 'pl-8')}
                    value={link}
                    onChange={(e) => {
                      setLink(e.target.value);
                      setLinkError(null);
                    }}
                    placeholder="https://makerworld.com/en/models/…"
                    aria-invalid={!!linkError}
                    aria-describedby={linkError ? `${id}-err` : undefined}
                  />
                </div>
                <Button type="submit" variant="primary" disabled={!link.trim() || !!busy}>
                  {busy === 'resolve' ? <Loader2 className="size-4 animate-spin" /> : null} Continue
                </Button>
              </div>
            )}
          </Field>
          {linkError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {linkError}
            </p>
          )}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            RackPlanner reads the model’s public page once to fill in the title, designer, licence and picture. If MakerWorld blocks that, you can fill them in yourself.
            Print files are never downloaded: the part links to the model page.
          </p>
        </form>
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-4 border-b border-zinc-200 bg-zinc-100 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-950">
            <Thumbnail id={form.thumbnail} busy={busy === 'image'} onPick={() => fileRef.current?.click()} onClear={() => set('thumbnail', null)} />
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1" aria-label="Faceplate preview">
              {built?.part ? <PartThumb part={built.part} rackWidth={form.rackWidth} width={form.rackWidth === '19in' ? 300 : 220} lod="high" /> : <span className="text-sm text-zinc-500">{built?.error}</span>}
              <span className="text-[10px] tracking-wide text-zinc-500 uppercase">front</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              className="hidden"
              aria-label="Upload a thumbnail"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void takeImage(f);
                e.target.value = '';
              }}
            />
          </div>

          <form
            className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4"
            onSubmit={(e) => {
              e.preventDefault();
              void save(false);
            }}
          >
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <a href={form.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 truncate text-blue-600 hover:underline dark:text-blue-400">
                <ExternalLink className="size-3.5 shrink-0" /> <span className="truncate">{form.source.url}</span>
              </a>
              <Button onClick={() => void refresh()} disabled={!!busy} title="Fetch the model page again" className="ml-auto border border-zinc-300 dark:border-zinc-700">
                <RefreshCw className={cx('size-3.5', busy === 'refresh' && 'animate-spin')} /> Refresh details
              </Button>
            </div>
            {!form.fetched && (
              <p role="note" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                Details couldn’t be fetched automatically{form.reason ? ` (${form.reason})` : ''}. The name comes from the link; fill in the rest, and paste or upload a picture if you like.
              </p>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name *" className="sm:col-span-2">
                {(id) => <input id={id} className={input} value={form.name} onChange={(e) => set('name', e.target.value)} />}
              </Field>
              <Field label="Part type">
                {(id) => (
                  <select id={id} className={select} value={form.kind} onChange={(e) => set('kind', e.target.value as PrintedKind)}>
                    {PRINTED_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {PRINTED_KIND_LABELS[k]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Print status">
                {(id) => (
                  <select id={id} className={select} value={form.status} onChange={(e) => set('status', e.target.value as PrintStatus)}>
                    {PRINT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {PRINT_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>

            <fieldset className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <legend className="pr-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Size & mounting</legend>
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Height" hint={form.heightGuessed ? <span className="font-medium text-amber-700 dark:text-amber-400">Not in the title: check it</span> : undefined}>
                  {(id) => (
                    <select
                      id={id}
                      className={cx(select, form.heightGuessed && 'border-amber-500 ring-2 ring-amber-400/60')}
                      value={form.heightU}
                      onChange={(e) => setForm((f) => f && { ...f, heightU: Number(e.target.value), heightGuessed: false })}
                    >
                      {U_OPTIONS.map((u) => (
                        <option key={u} value={u}>
                          {u}U
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                <Field label="Rack width">
                  {(id) => (
                    <select id={id} className={select} value={form.rackWidth} onChange={(e) => set('rackWidth', e.target.value as Form['rackWidth'])}>
                      <option value="10in">10″</option>
                      <option value="19in">19″</option>
                    </select>
                  )}
                </Field>
                <Field label="Depth (mm)" hint={form.depthMm ? undefined : 'Blank: the held device’s depth'}>
                  {(id) => <input id={id} className={input} type="number" min={1} max={2000} value={form.depthMm} onChange={(e) => set('depthMm', e.target.value)} placeholder={built?.part?.depthMm ? String(built.part.depthMm) : 'unknown'} />}
                </Field>
                <Field label="Mounting">
                  {(id) => (
                    <select id={id} className={select} value={form.mounting} onChange={(e) => set('mounting', e.target.value as Form['mounting'])}>
                      <option value="front">Front</option>
                      <option value="rear">Rear</option>
                    </select>
                  )}
                </Field>
                <Field label="Filament colour">
                  {(id) => (
                    <div className="flex items-center gap-2">
                      <input id={id} type="color" className="h-8 w-12 cursor-pointer rounded border border-zinc-300 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900" value={form.filament} onChange={(e) => set('filament', e.target.value)} />
                      <code className="text-xs text-zinc-500">{form.filament}</code>
                    </div>
                  )}
                </Field>
              </div>
            </fieldset>

            {(form.kind === 'rackmount' || form.kind === 'shelf') && (
              <fieldset className="space-y-2 border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <legend className="pr-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Device it holds</legend>
                {form.holdsSuggested && form.holds.length > 0 && (
                  <p className="rounded-md bg-blue-50 px-3 py-1.5 text-xs text-blue-800 dark:bg-blue-950/50 dark:text-blue-300">
                    Matched from the title: confirm it, pick another, or remove it.{' '}
                    <button type="button" className="font-semibold underline" onClick={() => set('holdsSuggested', false)}>
                      Looks right
                    </button>
                  </p>
                )}
                {form.holds.map((h, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      aria-label={`Held device ${i + 1}`}
                      className={cx(selectClass, 'min-w-0 flex-1')}
                      value={h.partId}
                      onChange={(e) => setForm((f) => f && { ...f, holdsSuggested: false, holds: f.holds.map((x, j) => (j === i ? { ...x, partId: e.target.value } : x)) })}
                    >
                      {holdable.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={`How many of device ${i + 1}`}
                      type="number"
                      min={1}
                      max={12}
                      className={cx(input.replace('w-full', ''), 'w-16 shrink-0')}
                      value={h.qty}
                      onChange={(e) => setForm((f) => f && { ...f, holds: f.holds.map((x, j) => (j === i ? { ...x, qty: Math.min(12, Math.max(1, Math.round(Number(e.target.value) || 1))) } : x)) })}
                    />
                    <Button aria-label={`Remove held device ${i + 1}`} variant="danger" onClick={() => setForm((f) => f && { ...f, holds: f.holds.filter((_, j) => j !== i), holdsSuggested: false })} className="px-1.5">
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Button onClick={() => setForm((f) => f && { ...f, holdsSuggested: false, holds: [...f.holds, { partId: suggestions[0]?.part.id ?? holdable[0]!.id, qty: 1 }] })} disabled={form.holds.length >= 8} className="border border-zinc-300 dark:border-zinc-700">
                    <Plus className="size-3.5" /> Add a device
                  </Button>
                  {form.holds.length === 0 && <span className="text-zinc-500">None: the mount is placed empty.</span>}
                  {suggestions
                    .filter((s) => !form.holds.some((h) => h.partId === s.part.id))
                    .slice(0, 3)
                    .map((s) => (
                      <button
                        key={s.part.id}
                        type="button"
                        className="rounded-full border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                        title={`Match ${Math.round(s.score * 100)}%`}
                        onClick={() => setForm((f) => f && { ...f, holdsSuggested: false, holds: [...f.holds, { partId: s.part.id, qty: 1 }] })}
                      >
                        + {s.part.name}
                      </button>
                    ))}
                </div>
              </fieldset>
            )}

            <fieldset className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <legend className="pr-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">Credit & licence</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Designer">{(id) => <input id={id} className={input} value={form.source.designer ?? ''} onChange={(e) => setSource('designer', e.target.value.slice(0, 120) || null)} />}</Field>
                <Field label="Designer profile URL">
                  {(id) => <input id={id} className={input} type="url" value={form.source.designerUrl ?? ''} onChange={(e) => setSource('designerUrl', e.target.value || null)} placeholder="https://makerworld.com/en/@…" />}
                </Field>
                <Field
                  label="Licence"
                  hint={
                    lic && (lic.nonCommercial || lic.noDerivatives) ? (
                      <span className="inline-flex items-center gap-1 font-medium text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="size-3" /> {[lic.nonCommercial && 'Non-commercial', lic.noDerivatives && 'No derivatives'].filter(Boolean).join(' · ')}
                      </span>
                    ) : undefined
                  }
                >
                  {(id) => <input id={id} className={input} value={form.source.licence ?? ''} onChange={(e) => setSource('licence', e.target.value.slice(0, 120) || null)} placeholder="e.g. CC BY-NC-SA 4.0" />}
                </Field>
                <Field label="Print profile">
                  {(id) => <input id={id} className={input} value={form.source.profileName ?? ''} onChange={(e) => setSource('profileName', e.target.value.slice(0, 200) || null)} placeholder={form.source.profileId ? `Profile ${form.source.profileId}` : 'none'} />}
                </Field>
                <Field label="Notes" className="sm:col-span-2">
                  {(id) => <textarea id={id} className={cx(input, 'h-16 py-1')} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Supports, infill, screws…" />}
                </Field>
              </div>
              {form.source.description && <p className="line-clamp-3 text-xs text-zinc-500 dark:text-zinc-400">{form.source.description}</p>}
            </fieldset>
            <button type="submit" hidden />
          </form>

          <footer className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
            {built?.error && <span className="mr-auto truncate text-xs text-red-600 dark:text-red-400">{built.error}</span>}
            <Button onClick={close}>Cancel</Button>
            <Button onClick={() => void save(false)} disabled={!built?.part || !form.name.trim() || !!busy} className="border border-zinc-300 dark:border-zinc-700">
              Save to catalog
            </Button>
            {!editing && (
              <Button variant="primary" onClick={() => void save(true)} disabled={!built?.part || !form.name.trim() || !!busy}>
                {busy === 'save' && <Loader2 className="size-4 animate-spin" />} Save & add to rack
              </Button>
            )}
          </footer>
        </>
      )}
    </dialog>
  );
}

function Thumbnail({ id, busy, onPick, onClear }: { id: string | null; busy: boolean; onPick: () => void; onClear: () => void }) {
  return (
    <div className="relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900">
      {busy ? (
        <Loader2 className="size-5 animate-spin text-zinc-400" />
      ) : id ? (
        <>
          <img src={thumbnailUrl(id)} alt="Model thumbnail" className="size-full object-cover" />
          <button type="button" aria-label="Remove thumbnail" onClick={onClear} className="absolute top-1 right-1 rounded bg-black/60 p-0.5 text-white hover:bg-black/80">
            <X className="size-3" />
          </button>
        </>
      ) : (
        <button type="button" onClick={onPick} className="flex flex-col items-center gap-1 p-1 text-center text-[10px] leading-tight text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200">
          <ImagePlus className="size-5" />
          Upload or paste a picture
        </button>
      )}
    </div>
  );
}
