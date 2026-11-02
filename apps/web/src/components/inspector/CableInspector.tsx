import {
  CABLE_COLORS,
  CABLE_TYPES,
  CABLE_TYPE_LABELS,
  displayName,
  portOptions,
  suggestCableLengthM,
  type Cable,
  type CableEnd,
  type CableType,
} from '@rackplanner/shared';
import { ArrowLeftRight, Trash2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useCatalogStore } from '../../store/catalogStore';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { cableDistanceMm } from '../rack/cableGeometry';
import { Button, cx, inputClass, selectClass } from '../ui';

const SWATCHES = ['#3b82f6', '#22c55e', '#ef4444', '#f97316', '#eab308', '#a855f7', '#ec4899', '#06b6d4', '#e5e7eb', '#1f2937'];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
      {children}
    </div>
  );
}

function EndEditor({ label, end, onChange }: { label: string; end: CableEnd; onChange: (e: CableEnd) => void }) {
  const placements = useDesignStore((s) => s.design.placements);
  const catalog = useCatalogStore((s) => s.catalog);
  const p = placements.find((q) => q.id === end.placementId);
  const part = p && catalog.get(p.partId);
  const options = part ? portOptions(part) : [];
  const value = end.port ? `${end.port.type}:${end.port.index}` : '';
  return (
    <Field label={label}>
      <button
        type="button"
        className="block w-full truncate text-left text-sm font-semibold text-blue-700 hover:underline dark:text-blue-400"
        onClick={() => p && useUiStore.getState().select(p.id)}
        title="Select this device"
      >
        {p ? displayName(p, part) : 'Missing device'}
      </button>
      <select
        aria-label={`${label} port`}
        className={cx(selectClass, 'w-full')}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return onChange({ placementId: end.placementId });
          const [type, index] = v.split(':');
          onChange({ placementId: end.placementId, port: { type: type as NonNullable<CableEnd['port']>['type'], index: Number(index) } });
        }}
      >
        <option value="">Whole device (no specific port)</option>
        {options.map((o) => (
          <option key={`${o.type}:${o.index}`} value={`${o.type}:${o.index}`}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CableInspector({ cable }: { cable: Cable }) {
  const design = useDesignStore((s) => s.design);
  const updateCable = useDesignStore((s) => s.updateCable);
  const removeCable = useDesignStore((s) => s.removeCable);
  const catalog = useCatalogStore((s) => s.catalog);
  const [label, setLabel] = useState(cable.label ?? '');
  const [length, setLength] = useState(cable.lengthM === undefined ? '' : String(cable.lengthM));
  useEffect(() => setLabel(cable.label ?? ''), [cable.label]);
  useEffect(() => setLength(cable.lengthM === undefined ? '' : String(cable.lengthM)), [cable.lengthM]);

  const dist = cableDistanceMm(design, catalog, cable.a, cable.b);
  const suggested = dist !== null ? suggestCableLengthM(dist) : null;

  const commitLength = () => {
    const n = length.trim() === '' ? undefined : Number(length);
    if (n !== undefined && (!Number.isFinite(n) || n <= 0 || n > 1000)) return setLength(cable.lengthM === undefined ? '' : String(cable.lengthM));
    if (n !== cable.lengthM) updateCable(cable.id, { lengthM: n });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Cable</div>
        <span className="inline-block h-2 w-16 rounded-full" style={{ background: cable.color }} aria-hidden />
      </div>

      <EndEditor label="From" end={cable.a} onChange={(a) => updateCable(cable.id, { a })} />
      <div className="flex justify-center">
        <Button aria-label="Swap ends" title="Swap ends" className="px-1.5" onClick={() => updateCable(cable.id, { a: cable.b, b: cable.a })}>
          <ArrowLeftRight className="size-4" />
        </Button>
      </div>
      <EndEditor label="To" end={cable.b} onChange={(b) => updateCable(cable.id, { b })} />

      <Field label="Type">
        <select
          aria-label="Cable type"
          className={cx(selectClass, 'w-full')}
          value={cable.type}
          onChange={(e) => {
            const type = e.target.value as CableType;
            // Follow the type's default colour unless a custom colour was picked.
            const keepColor = !Object.values(CABLE_COLORS).includes(cable.color);
            updateCable(cable.id, { type, ...(keepColor ? {} : { color: CABLE_COLORS[type] }) });
          }}
        >
          {CABLE_TYPES.map((t) => (
            <option key={t} value={t}>
              {CABLE_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Colour">
        <div className="flex flex-wrap gap-1.5">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              onClick={() => updateCable(cable.id, { color: c })}
              style={{ background: c }}
              className={cx('size-6 rounded-full border border-zinc-300 dark:border-zinc-600', cable.color === c && 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-zinc-900')}
            />
          ))}
          <input type="color" aria-label="Custom colour" value={cable.color} onChange={(e) => updateCable(cable.id, { color: e.target.value })} className="size-6 cursor-pointer rounded-full border-0 bg-transparent p-0" />
        </div>
      </Field>

      <Field label="Length">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0.05}
            step="any"
            inputMode="decimal"
            aria-label="Cable length in metres"
            className={cx(inputClass, 'w-24')}
            value={length}
            placeholder="—"
            onChange={(e) => setLength(e.target.value)}
            onBlur={commitLength}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <span className="text-xs text-zinc-500">m</span>
          {suggested !== null && suggested !== cable.lengthM && (
            <Button className="border border-zinc-300 text-xs dark:border-zinc-700" onClick={() => updateCable(cable.id, { lengthM: suggested })} title="Distance between the ends plus slack, rounded up to a standard length">
              Use {suggested} m
            </Button>
          )}
        </div>
      </Field>

      <Field label="Label">
        <input
          aria-label="Cable label"
          className={inputClass}
          value={label}
          placeholder="e.g. Office AP, VLAN 20"
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label.trim() !== (cable.label ?? '') && updateCable(cable.id, { label: label.trim() || undefined })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </Field>

      <Button
        variant="danger"
        className="w-full border border-red-200 dark:border-red-900"
        onClick={() => {
          removeCable(cable.id);
          useUiStore.getState().selectCable(null);
        }}
      >
        <Trash2 className="size-4" /> Delete cable
      </Button>
    </div>
  );
}
