import {
  PORT_TYPE_LABELS,
  allowedMountings,
  checkPlacement,
  formatURange,
  occupancyOf,
  type Mounting,
  type Part,
  type PlacedPart,
  type PortType,
} from '@rackplanner/shared';
import { Copy, ExternalLink, Pencil, Trash2, Wand2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { deleteSelected, duplicateSelected } from '../../lib/actions';
import { toast } from '../../lib/toast';
import { useCatalogStore } from '../../store/catalogStore';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { PartThumb } from '../faceplates/PartThumb';
import { Badge, Button, cx, inputClass, selectClass } from '../ui';

const SWATCHES = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

/** Text input that commits on blur / Enter, so typing doesn't flood undo history. */
function CommitText({
  value,
  onCommit,
  multiline,
  placeholder,
  label,
}: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  label: string;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  const common = {
    value: draft,
    placeholder,
    'aria-label': label,
    onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
    onBlur: commit,
  };
  return multiline ? (
    <textarea {...common} rows={3} className={cx(inputClass, 'h-auto py-1.5')} />
  ) : (
    <input
      {...common}
      className={inputClass}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
      {children}
    </div>
  );
}

function fmt(v: number | null | undefined, unit: string): string {
  return v === null || v === undefined ? '—' : `${v} ${unit}`;
}

function Specs({ part }: { part: Part }) {
  const ports = (Object.entries(part.ports) as [PortType, number][]).filter(([, n]) => n > 0);
  const rows: [string, string][] = [
    ['Height', `${part.heightU}U`],
    ['Width', typeof part.width === 'object' ? `${part.width.mm} mm` : part.width.replace('in', '″')],
    ['Depth', fmt(part.depthMm, 'mm')],
    ['Power (typ / max)', `${fmt(part.power.typicalW, 'W')} / ${fmt(part.power.maxW, 'W')}`],
    ['Weight', fmt(part.weightKg, 'kg')],
  ];
  if (part.poeBudgetW) rows.push(['PoE budget', `${part.poeBudgetW} W`]);
  if (part.ups) rows.push(['UPS capacity', `${part.ups.capacityW} W${part.ups.capacityVA ? ` / ${part.ups.capacityVA} VA` : ''}`]);
  if (part.driveBays?.length) rows.push(['Drive bays', part.driveBays.map((b) => `${b.count}× ${b.size}″`).join(', ')]);
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-zinc-500 dark:text-zinc-400">{k}</dt>
            <dd className="text-right font-medium tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      {ports.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {ports.map(([k, n]) => (
            <Badge key={k}>
              {n}× {PORT_TYPE_LABELS[k]}
            </Badge>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 text-xs">
        {part.verified ? <Badge tone="green">verified</Badge> : <Badge tone="amber" title="Specs not yet confirmed against the manufacturer">unverified</Badge>}
        {part.sourceUrl && (
          <a href={part.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-600 hover:underline dark:text-blue-400">
            Spec source <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </div>
  );
}

/** Per-placement measured draw; overrides catalog figures in the stats. */
function MeasuredPower({ placement, part }: { placement: PlacedPart; part: Part }) {
  const updatePlacement = useDesignStore((s) => s.updatePlacement);
  const value = placement.measuredW;
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  useEffect(() => setDraft(value === undefined ? '' : String(value)), [value]);
  const commit = () => {
    const n = draft.trim() === '' ? undefined : Number(draft);
    if (n !== undefined && (!Number.isFinite(n) || n < 0 || n > 100000)) {
      toast('Measured power must be a positive number of watts', 'error');
      setDraft(value === undefined ? '' : String(value));
      return;
    }
    if (n !== value) updatePlacement(placement.id, { measuredW: n });
  };
  const catalogW = part.power.typicalW ?? part.power.maxW;
  return (
    <Field label="Measured power">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          aria-label="Measured power in watts"
          className={cx(inputClass, 'flex-1')}
          value={draft}
          placeholder={catalogW !== null ? `catalog: ${catalogW} W` : 'unknown — enter your reading'}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span className="text-xs text-zinc-500">W</span>
      </div>
      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">From a smart plug, UPS or PDU reading. Used instead of catalog figures in the stats.</p>
    </Field>
  );
}

function PlacementInspector({ placement, part }: { placement: PlacedPart; part: Part }) {
  const design = useDesignStore((s) => s.design);
  const updatePlacement = useDesignStore((s) => s.updatePlacement);
  const catalog = useCatalogStore((s) => s.catalog);
  const occ = occupancyOf(design.placements, placement, catalog);
  const mountings = allowedMountings(part);

  const setMounting = (m: Mounting) => {
    const check = checkPlacement(design, { ...placement, mounting: m }, catalog);
    if (!check.ok) {
      toast(check.problems[0]?.message ?? 'Cannot change mounting', 'error');
      return;
    }
    updatePlacement(placement.id, { mounting: m });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <PartThumb part={part} rackWidth={design.rack.width} width={260} />
        <div>
          <div className="font-semibold leading-tight">{part.name}</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {part.brand} · {part.model}
            {occ && ` · ${formatURange(occ.u0, occ.u1, design.rack)}`}
            {placement.parentId && ' · on shelf'}
          </div>
        </div>
      </div>

      <Field label="Label / hostname">
        <CommitText
          label="Label"
          value={placement.label ?? ''}
          placeholder={part.name}
          onCommit={(v) => updatePlacement(placement.id, { label: v.trim() || undefined })}
        />
      </Field>

      <Field label="Colour tag">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-label="No colour"
            onClick={() => updatePlacement(placement.id, { color: undefined })}
            className={cx(
              'size-6 rounded-full border-2 border-dashed border-zinc-400',
              !placement.color && 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-zinc-900',
            )}
          />
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              onClick={() => updatePlacement(placement.id, { color: c })}
              style={{ background: c }}
              className={cx('size-6 rounded-full', placement.color === c && 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-zinc-900')}
            />
          ))}
        </div>
      </Field>

      {placement.parentId === undefined && (
        <Field label="Mounting">
          <select
            className={cx(selectClass, 'w-full')}
            value={placement.mounting}
            disabled={mountings.length < 2}
            onChange={(e) => setMounting(e.target.value as Mounting)}
            aria-label="Mounting"
          >
            {mountings.map((m) => (
              <option key={m} value={m}>
                {m === 'full-depth' ? 'Full depth (front + rear)' : m === 'front' ? 'Front' : 'Rear'}
              </option>
            ))}
          </select>
        </Field>
      )}

      <MeasuredPower placement={placement} part={part} />

      <Field label="Notes">
        <CommitText
          label="Notes"
          multiline
          value={placement.notes ?? ''}
          placeholder="IP, VLAN, serial…"
          onCommit={(v) => updatePlacement(placement.id, { notes: v.trim() || undefined })}
        />
      </Field>

      <div className="flex gap-2">
        <Button onClick={duplicateSelected} title="Duplicate (Ctrl+D)" className="flex-1 border border-zinc-300 dark:border-zinc-700">
          <Copy className="size-4" /> Duplicate
        </Button>
        <Button variant="danger" onClick={deleteSelected} title="Delete (Del)" className="flex-1 border border-red-200 dark:border-red-900">
          <Trash2 className="size-4" /> Delete
        </Button>
      </div>

      <div className="space-y-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <Specs part={part} />
        {part.notes && <p className="text-xs text-zinc-500 dark:text-zinc-400">{part.notes}</p>}
        <Button
          onClick={() => useUiStore.getState().openBuilder(part.source === 'custom' ? { mode: 'edit', partId: part.id } : { mode: 'copy', partId: part.id })}
          className="w-full border border-zinc-300 dark:border-zinc-700"
        >
          {part.source === 'custom' ? (
            <>
              <Pencil className="size-4" /> Edit custom part
            </>
          ) : (
            <>
              <Wand2 className="size-4" /> Customise a copy of this part
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function RackSummary() {
  const design = useDesignStore((s) => s.design);
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {design.placements.length} device{design.placements.length === 1 ? '' : 's'} in a {design.rack.heightU}U{' '}
        {design.rack.width === '19in' ? '19″' : '10″'} rack. Select a device to edit it.
      </p>
      <div className="space-y-1.5 text-xs text-zinc-500 dark:text-zinc-400">
        <div className="font-semibold text-zinc-700 dark:text-zinc-300">Shortcuts</div>
        {[
          ['Drag / click', 'add from catalog'],
          ['↑ / ↓', 'move selected 1U'],
          ['Del', 'remove'],
          ['Ctrl+D', 'duplicate'],
          ['Ctrl+Z / Ctrl+Shift+Z', 'undo / redo'],
          ['+ / − / 0', 'zoom / fit'],
          ['Ctrl+scroll', 'zoom'],
        ].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2">
            <kbd className="font-mono text-zinc-700 dark:text-zinc-300">{k}</kbd>
            <span>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Inspector() {
  const selectedId = useUiStore((s) => s.selectedId);
  const placement = useDesignStore((s) => s.design.placements.find((p) => p.id === selectedId));
  const part = useCatalogStore((s) => (placement ? s.catalog.get(placement.partId) : undefined));
  return placement && part ? <PlacementInspector key={placement.id} placement={placement} part={part} /> : <RackSummary />;
}
