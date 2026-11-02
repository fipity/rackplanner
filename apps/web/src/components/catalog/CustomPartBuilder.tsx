/**
 * Create / edit a custom part. The form keeps a loosely typed draft (strings
 * for numeric inputs) and converts it to a Part candidate on every change,
 * validating with the same zod schema the server uses. The faceplate preview
 * renders the last valid candidate.
 */
import {
  PORT_TYPES,
  PORT_TYPE_LABELS,
  PartSchema,
  U_MM,
  type BodyFinish,
  type Mounting,
  type Part,
  type PortType,
  type RenderStyle,
} from '@rackplanner/shared';
import { Plus, Trash2, X } from 'lucide-react';
import { cloneElement, isValidElement, useEffect, useId, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { ApiError, createPart, updatePart } from '../../lib/api';
import { categoryLabel } from '../../lib/catalogFilter';
import { toast } from '../../lib/toast';
import { useCatalogStore } from '../../store/catalogStore';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { PartThumb } from '../faceplates/PartThumb';
import { Button, cx, inputClass, selectClass } from '../ui';

type WidthKind = '19in' | '10in' | 'half-19in' | 'mm';
type BaySize = '2.5' | '3.5' | 'm2';

interface Draft {
  name: string;
  brand: string;
  model: string;
  category: string;
  formFactor: 'rack' | 'desktop';
  heightU: string;
  heightMm: string;
  widthKind: WidthKind;
  widthMm: string;
  depthMm: string;
  mounting: Mounting;
  rack19: boolean;
  rack10: boolean;
  typicalW: string;
  maxW: string;
  poeBudgetW: string;
  weightKg: string;
  ports: { type: PortType; count: string }[];
  bays: { count: string; size: BaySize }[];
  isShelf: boolean;
  shelfW: string;
  shelfD: string;
  isUps: boolean;
  upsW: string;
  upsVA: string;
  style: RenderStyle;
  body: BodyFinish;
  accent: string;
  tags: string;
  notes: string;
  sourceUrl: string;
}

const STYLES: RenderStyle[] = ['switch', 'gateway', 'server', 'nas', 'patch-panel', 'ups', 'pdu', 'shelf', 'blank', 'vented', 'brush', 'cable-manager', 'drawer', 'fan', 'desktop'];
const FINISHES: BodyFinish[] = ['black', 'grey', 'silver', 'white'];
const STYLE_FOR_CATEGORY: Record<string, RenderStyle> = {
  switch: 'switch', gateway: 'gateway', server: 'server', nas: 'nas', nvr: 'nas', 'patch-panel': 'patch-panel',
  power: 'pdu', shelf: 'shelf', blank: 'blank', 'cable-management': 'cable-manager',
};

const s = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

function emptyDraft(): Draft {
  return {
    name: '', brand: 'Custom', model: '', category: 'switch', formFactor: 'rack', heightU: '1', heightMm: '40',
    widthKind: '19in', widthMm: '200', depthMm: '', mounting: 'front', rack19: true, rack10: false,
    typicalW: '', maxW: '', poeBudgetW: '', weightKg: '', ports: [{ type: 'rj45_1g', count: '8' }], bays: [],
    isShelf: false, shelfW: '430', shelfD: '250', isUps: false, upsW: '', upsVA: '',
    style: 'switch', body: 'black', accent: '#3b82f6', tags: '', notes: '', sourceUrl: '',
  };
}

function fromPart(p: Part): Draft {
  const w = p.width;
  return {
    name: p.name, brand: p.brand, model: p.model, category: p.category, formFactor: p.formFactor,
    heightU: String(p.heightU), heightMm: s(p.heightMm ?? Math.round(p.heightU * U_MM)),
    widthKind: typeof w === 'object' ? 'mm' : w, widthMm: typeof w === 'object' ? String(w.mm) : '200',
    depthMm: s(p.depthMm), mounting: p.mounting, rack19: p.rackWidths.includes('19in'), rack10: p.rackWidths.includes('10in'),
    typicalW: s(p.power.typicalW), maxW: s(p.power.maxW), poeBudgetW: s(p.poeBudgetW), weightKg: s(p.weightKg),
    ports: (Object.entries(p.ports) as [PortType, number][]).filter(([, n]) => n > 0).map(([type, n]) => ({ type, count: String(n) })),
    bays: (p.driveBays ?? []).filter((b): b is { count: number; size: BaySize } => ['2.5', '3.5', 'm2'].includes(b.size)).map((b) => ({ count: String(b.count), size: b.size })),
    isShelf: !!p.shelf, shelfW: s(p.shelf?.usableWidthMm ?? 430), shelfD: s(p.shelf?.usableDepthMm ?? 250),
    isUps: !!p.ups, upsW: s(p.ups?.capacityW), upsVA: s(p.ups?.capacityVA),
    style: p.render.style, body: p.render.body ?? 'black', accent: p.render.accent ?? '#3b82f6',
    tags: p.tags.join(', '), notes: p.notes ?? '', sourceUrl: p.sourceUrl ?? '',
  };
}

const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));

/** Draft → object for PartSchema (server fills id/source/verified). */
function toInput(d: Draft): Record<string, unknown> {
  const desktop = d.formFactor === 'desktop';
  const heightU = desktop ? Math.max(1, Math.ceil((num(d.heightMm) ?? U_MM) / U_MM - 0.02)) : num(d.heightU);
  const ports: Partial<Record<PortType, number>> = {};
  for (const p of d.ports) {
    const n = num(p.count);
    if (n) ports[p.type] = (ports[p.type] ?? 0) + n;
  }
  const rackWidths = [d.rack19 && '19in', d.rack10 && '10in'].filter((x): x is string => !!x);
  const out: Record<string, unknown> = {
    brand: d.brand.trim() || 'Custom',
    model: d.model.trim() || d.name.trim(),
    name: d.name.trim(),
    category: d.category.trim().toLowerCase().replace(/\s+/g, '-'),
    formFactor: d.formFactor,
    heightU,
    width: d.widthKind === 'mm' ? { mm: num(d.widthMm) } : d.widthKind,
    depthMm: num(d.depthMm),
    mounting: d.mounting,
    rackWidths,
    power: { typicalW: num(d.typicalW), maxW: num(d.maxW) },
    weightKg: num(d.weightKg),
    ports,
    render: { style: desktop ? 'desktop' : d.style, body: d.body, accent: d.accent },
    tags: ['custom', ...d.tags.split(',').map((t) => t.trim()).filter(Boolean)].filter((t, i, a) => a.indexOf(t) === i),
  };
  if (desktop) out.heightMm = num(d.heightMm);
  if (num(d.poeBudgetW)) out.poeBudgetW = num(d.poeBudgetW);
  const bays = d.bays.map((b) => ({ count: num(b.count), size: b.size })).filter((b) => b.count);
  if (bays.length) out.driveBays = bays;
  if (d.isShelf && !desktop) out.shelf = { usableWidthMm: num(d.shelfW), usableDepthMm: num(d.shelfD) };
  if (d.isUps) out.ups = { capacityW: num(d.upsW), capacityVA: num(d.upsVA) };
  if (d.notes.trim()) out.notes = d.notes.trim();
  out.sourceUrl = d.sourceUrl.trim() || null;
  return out;
}

/** Label + control + error. The single child control gets an id so the label can point at it with htmlFor. */
function Field({ label, error, children, className }: { label: string; error?: string | undefined; children: ReactElement<{ id?: string }>; className?: string }) {
  const id = useId();
  const errId = `${id}-err`;
  return (
    <div className={cx('space-y-1', className)}>
      <label htmlFor={id} className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      {isValidElement(children) ? cloneElement(children as ReactElement<{ id?: string; 'aria-describedby'?: string }>, { id, ...(error ? { 'aria-describedby': errId } : {}) }) : children}
      {error && (
        <span id={errId} role="alert" className="block text-xs text-red-600 dark:text-red-400">
          {error}
        </span>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <legend className="pr-2 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{title}</legend>
      {children}
    </fieldset>
  );
}

export function CustomPartBuilder() {
  const builder = useUiStore((st) => st.builder);
  const close = () => useUiStore.getState().openBuilder(null);
  const catalog = useCatalogStore((st) => st.catalog);
  const parts = useCatalogStore((st) => st.parts);
  const rackWidth = useDesignStore((st) => st.design.rack.width);
  const source = builder?.partId ? catalog.get(builder.partId) : undefined;

  const [draft, setDraft] = useState<Draft>(() => {
    if (!source) return emptyDraft();
    const d = fromPart(source);
    return builder?.mode === 'copy' ? { ...d, name: `${d.name} (custom)`, brand: d.brand } : d;
  });
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  /** Errors stay hidden until the user edits something (name: until it's touched) or tries to save. */
  const [touched, setTouched] = useState<{ any: boolean; name: boolean; submitted: boolean }>({ any: false, name: false, submitted: false });
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);
  const lastGood = useRef<Part | null>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (dlg && !dlg.open) dlg.showModal();
  }, []);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setTouched((t) => ({ ...t, any: true, name: t.name || k === 'name' }));
    setDraft((d) => ({ ...d, [k]: v }));
  };

  const { parsed, errors } = useMemo(() => {
    const r = PartSchema.safeParse({ ...toInput(draft), id: 'custom-preview', source: 'custom', verified: false });
    const errs: Record<string, string> = {};
    if (!r.success) {
      for (const issue of r.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        errs[key] ??= issue.message;
      }
    }
    return { parsed: r.success ? r.data : null, errors: errs };
  }, [draft]);
  if (parsed) lastGood.current = parsed;
  const preview = parsed ?? lastGood.current;
  const err = (k: string) => {
    if (serverErrors[k]) return serverErrors[k];
    const show = touched.submitted || (touched.any && (k !== 'name' || touched.name));
    return show ? errors[k] : undefined;
  };

  const categories = useMemo(() => [...new Set(parts.map((p) => p.category))].sort(), [parts]);

  const setWidthKind = (widthKind: WidthKind) => {
    const narrow = widthKind === '10in' || (widthKind === 'mm' && (num(draft.widthMm) ?? 999) <= 222);
    setDraft((d) => ({ ...d, widthKind, rack19: true, rack10: narrow, shelfW: widthKind === '10in' ? '210' : d.shelfW }));
  };

  const save = async () => {
    setTouched((t) => ({ ...t, submitted: true }));
    if (!parsed || !draft.name.trim()) return;
    setSaving(true);
    setServerErrors({});
    try {
      const input = toInput(draft);
      const part = builder?.mode === 'edit' && source ? await updatePart(source.id, input) : await createPart(input);
      useCatalogStore.getState().upsert(part);
      toast(builder?.mode === 'edit' ? `Saved ${part.name}` : `Added ${part.name} to your catalog`);
      close();
    } catch (e) {
      if (e instanceof ApiError && e.issues) {
        setServerErrors(Object.fromEntries(e.issues.map((i) => [String(i.path[0] ?? 'form'), i.message])));
      }
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const title = builder?.mode === 'edit' ? `Edit ${source?.name ?? 'part'}` : builder?.mode === 'copy' ? `Customise ${source?.name ?? 'part'}` : 'New custom part';
  const desktop = draft.formFactor === 'desktop';
  const input = cx(inputClass);
  const select = cx(selectClass, 'w-full');

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      aria-label={title}
      className="m-auto flex max-h-[min(52rem,calc(100vh-2rem))] w-[min(46rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/40 open:flex dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <header className="flex items-center justify-between border-b border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <h2 className="text-lg font-semibold">{title}</h2>
        <Button aria-label="Close" onClick={close} className="px-1.5">
          <X className="size-4" />
        </Button>
      </header>

      <div className="flex min-h-24 items-center justify-center border-b border-zinc-200 bg-zinc-100 px-5 py-4 dark:border-zinc-800 dark:bg-zinc-950">
        {preview ? <PartThumb part={preview} rackWidth={draft.rack19 ? '19in' : '10in'} width={560} /> : <span className="text-sm text-zinc-500">Fill in the form to see a preview</span>}
      </div>

      <form
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name *" error={err('name')} className="sm:col-span-2">
            <input className={input} value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Proxmox node 1U" autoFocus />
          </Field>
          <Field label="Brand" error={err('brand')}>
            <input className={input} value={draft.brand} onChange={(e) => set('brand', e.target.value)} />
          </Field>
          <Field label="Model" error={err('model')}>
            <input className={input} value={draft.model} onChange={(e) => set('model', e.target.value)} placeholder="Defaults to the name" />
          </Field>
          <Field label="Category" error={err('category')}>
            <input
              className={input}
              list="rp-categories"
              value={draft.category}
              onChange={(e) => {
                const category = e.target.value;
                setDraft((d) => ({ ...d, category, style: STYLE_FOR_CATEGORY[category] ?? d.style }));
              }}
            />
          </Field>
          <Field label="Form factor">
            <select className={select} value={draft.formFactor} onChange={(e) => set('formFactor', e.target.value as Draft['formFactor'])}>
              <option value="rack">Rack-mount</option>
              <option value="desktop">Desktop (sits on a shelf)</option>
            </select>
          </Field>
        </div>

        <Section title="Size & mounting">
          <div className="grid gap-3 sm:grid-cols-3">
            {desktop ? (
              <Field label={`Height (mm) → ${preview?.heightU ?? '?'}U on a shelf`} error={err('heightMm') ?? err('heightU')}>
                <input className={input} type="number" min={1} value={draft.heightMm} onChange={(e) => set('heightMm', e.target.value)} />
              </Field>
            ) : (
              <Field label="Height" error={err('heightU')}>
                <select className={select} value={draft.heightU} onChange={(e) => set('heightU', e.target.value)}>
                  {[0.5, 1, 1.5, 2, 3, 4, 5, 6, 7, 8].map((u) => (
                    <option key={u} value={u}>
                      {u}U
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Width" error={err('width')}>
              <select className={select} value={draft.widthKind} onChange={(e) => setWidthKind(e.target.value as WidthKind)}>
                <option value="19in">19″ full width</option>
                <option value="half-19in">Half of 19″</option>
                <option value="10in">10″ full width</option>
                <option value="mm">Custom (mm)</option>
              </select>
            </Field>
            {draft.widthKind === 'mm' ? (
              <Field label="Width (mm)" error={err('width')}>
                <input className={input} type="number" min={1} max={450} value={draft.widthMm} onChange={(e) => set('widthMm', e.target.value)} />
              </Field>
            ) : (
              <div className="hidden sm:block" />
            )}
            <Field label="Depth (mm)" error={err('depthMm')}>
              <input className={input} type="number" min={0} value={draft.depthMm} onChange={(e) => set('depthMm', e.target.value)} placeholder="unknown" />
            </Field>
            <Field label="Mounting" error={err('mounting')}>
              <select className={select} value={draft.mounting} onChange={(e) => set('mounting', e.target.value as Mounting)}>
                <option value="front">Front</option>
                <option value="rear">Rear</option>
                <option value="full-depth">Full depth (front + rear)</option>
              </select>
            </Field>
            <Field label="Fits racks" error={err('rackWidths')}>
              <div role="group" className="flex h-8 items-center gap-3 text-sm">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={draft.rack19} onChange={(e) => set('rack19', e.target.checked)} /> 19″
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={draft.rack10} onChange={(e) => set('rack10', e.target.checked)} /> 10″
                </label>
              </div>
            </Field>
          </div>
        </Section>

        <Section title="Power & weight">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Typical W" error={err('power')}>
              <input className={input} type="number" min={0} step="any" value={draft.typicalW} onChange={(e) => set('typicalW', e.target.value)} />
            </Field>
            <Field label="Max W" error={err('power')}>
              <input className={input} type="number" min={0} step="any" value={draft.maxW} onChange={(e) => set('maxW', e.target.value)} />
            </Field>
            <Field label="PoE budget W" error={err('poeBudgetW')}>
              <input className={input} type="number" min={0} step="any" value={draft.poeBudgetW} onChange={(e) => set('poeBudgetW', e.target.value)} />
            </Field>
            <Field label="Weight kg" error={err('weightKg')}>
              <input className={input} type="number" min={0} step="any" value={draft.weightKg} onChange={(e) => set('weightKg', e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.isUps} onChange={(e) => set('isUps', e.target.checked)} /> This is a UPS
          </label>
          {draft.isUps && (
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Capacity W" error={err('ups')}>
                <input className={input} type="number" min={1} value={draft.upsW} onChange={(e) => set('upsW', e.target.value)} />
              </Field>
              <Field label="Capacity VA" error={err('ups')}>
                <input className={input} type="number" min={1} value={draft.upsVA} onChange={(e) => set('upsVA', e.target.value)} />
              </Field>
            </div>
          )}
        </Section>

        <Section title="Ports">
          {draft.ports.map((p, i) => (
            <div key={i} className="flex gap-2">
              <select
                aria-label={`Port type ${i + 1}`}
                className={cx(selectClass, 'flex-1')}
                value={p.type}
                onChange={(e) => set('ports', draft.ports.map((q, j) => (j === i ? { ...q, type: e.target.value as PortType } : q)))}
              >
                {PORT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {PORT_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <input
                aria-label={`Port count ${i + 1}`}
                className={cx(inputClass, 'w-20')}
                type="number"
                min={0}
                value={p.count}
                onChange={(e) => set('ports', draft.ports.map((q, j) => (j === i ? { ...q, count: e.target.value } : q)))}
              />
              <Button aria-label="Remove port row" variant="danger" onClick={() => set('ports', draft.ports.filter((_, j) => j !== i))} className="px-1.5">
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          {err('ports') && <p className="text-xs text-red-600">{err('ports')}</p>}
          <Button onClick={() => set('ports', [...draft.ports, { type: 'rj45_1g', count: '1' }])} className="border border-dashed border-zinc-300 dark:border-zinc-700">
            <Plus className="size-4" /> Add ports
          </Button>
        </Section>

        <Section title="Drive bays">
          {draft.bays.map((b, i) => (
            <div key={i} className="flex gap-2">
              <input
                aria-label={`Bay count ${i + 1}`}
                className={cx(inputClass, 'w-20')}
                type="number"
                min={1}
                value={b.count}
                onChange={(e) => set('bays', draft.bays.map((q, j) => (j === i ? { ...q, count: e.target.value } : q)))}
              />
              <select
                aria-label={`Bay size ${i + 1}`}
                className={cx(selectClass, 'flex-1')}
                value={b.size}
                onChange={(e) => set('bays', draft.bays.map((q, j) => (j === i ? { ...q, size: e.target.value as BaySize } : q)))}
              >
                <option value="3.5">3.5″</option>
                <option value="2.5">2.5″</option>
                <option value="m2">M.2 (internal)</option>
              </select>
              <Button aria-label="Remove bay row" variant="danger" onClick={() => set('bays', draft.bays.filter((_, j) => j !== i))} className="px-1.5">
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button onClick={() => set('bays', [...draft.bays, { count: '4', size: '3.5' }])} className="border border-dashed border-zinc-300 dark:border-zinc-700">
            <Plus className="size-4" /> Add drive bays
          </Button>
          {!desktop && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={draft.isShelf} onChange={(e) => setDraft((d) => ({ ...d, isShelf: e.target.checked, style: e.target.checked ? 'shelf' : d.style }))} />
              This is a shelf (desktop gear can sit on it)
            </label>
          )}
          {draft.isShelf && !desktop && (
            <div className="grid gap-3 sm:grid-cols-4">
              <Field label="Usable width mm" error={err('shelf')}>
                <input className={input} type="number" min={1} value={draft.shelfW} onChange={(e) => set('shelfW', e.target.value)} />
              </Field>
              <Field label="Usable depth mm" error={err('shelf')}>
                <input className={input} type="number" min={1} value={draft.shelfD} onChange={(e) => set('shelfD', e.target.value)} />
              </Field>
            </div>
          )}
        </Section>

        <Section title="Appearance">
          <div className="grid gap-3 sm:grid-cols-3">
            {!desktop && (
              <Field label="Faceplate style">
                <select className={select} value={draft.style} onChange={(e) => set('style', e.target.value as RenderStyle)}>
                  {STYLES.filter((x) => x !== 'desktop').map((x) => (
                    <option key={x} value={x}>
                      {x.replace('-', ' ')}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Finish">
              <select className={select} value={draft.body} onChange={(e) => set('body', e.target.value as BodyFinish)}>
                {FINISHES.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Accent colour" error={err('render')}>
              <input className={cx(inputClass, 'p-1')} type="color" value={draft.accent} onChange={(e) => set('accent', e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Notes">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tags (comma separated)">
              <input className={input} value={draft.tags} onChange={(e) => set('tags', e.target.value)} placeholder="proxmox, homelab" />
            </Field>
            <Field label="Spec URL" error={err('sourceUrl')}>
              <input className={input} type="url" value={draft.sourceUrl} onChange={(e) => set('sourceUrl', e.target.value)} placeholder="https://…" />
            </Field>
            <Field label="Notes" className="sm:col-span-2">
              <textarea className={cx(inputClass, 'h-auto py-1.5')} rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
          </div>
        </Section>
        <datalist id="rp-categories">
          {categories.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </datalist>
        {/* Lets Enter submit from text fields. */}
        <button type="submit" hidden />
      </form>

      <footer className="flex items-center justify-between gap-3 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
        <p className="text-xs text-zinc-500">
          {Object.keys(errors).length > 0 && (touched.submitted || touched.name) ? `Fix ${Object.keys(errors).length} field${Object.keys(errors).length === 1 ? '' : 's'} to save.` : `Saved to your local catalog (${rackWidth === '19in' ? '19″' : '10″'} rack shown).`}
        </p>
        <div className="flex gap-2">
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={saving || (touched.submitted && !parsed)} onClick={() => void save()}>
            {saving ? 'Saving…' : builder?.mode === 'edit' ? 'Save changes' : 'Create part'}
          </Button>
        </div>
      </footer>
    </dialog>
  );
}
