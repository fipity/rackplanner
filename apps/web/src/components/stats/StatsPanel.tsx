import { CABLE_TYPE_LABELS, PORT_TYPE_LABELS, computeStats, type CableType, type PortType, type StatsWarning } from '@rackplanner/shared';
import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useCatalogStore } from '../../store/catalogStore';
import { useDesignStore } from '../../store/designStore';
import { useUiStore } from '../../store/uiStore';
import { Badge, cx, inputClass } from '../ui';

const fmtW = (w: number) => `${w.toLocaleString(undefined, { maximumFractionDigits: 1 })} W`;

function Meter({ value, max, tone }: { value: number; max: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div
        className={cx(
          'h-full rounded-full transition-[width]',
          tone === 'bad' ? 'bg-red-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-blue-500',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function Block({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Row({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm" title={hint}>
      <span className="text-zinc-600 dark:text-zinc-400">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

const ICON = { error: AlertOctagon, warning: AlertTriangle, info: Info } as const;
const TONE = {
  error: 'text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-900',
  warning: 'text-amber-800 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-900',
  info: 'text-sky-800 bg-sky-50 border-sky-200 dark:text-sky-300 dark:bg-sky-950/40 dark:border-sky-900',
} as const;

function WarningItem({ w }: { w: StatsWarning }) {
  const Icon = ICON[w.severity];
  const target = w.placementIds[0];
  const content = (
    <>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{w.message}</span>
    </>
  );
  const cls = cx('flex w-full gap-2 rounded-md border px-2.5 py-2 text-left text-xs leading-snug', TONE[w.severity]);
  return (
    <li>
      {target ? (
        <button type="button" className={cx(cls, 'hover:brightness-95')} onClick={() => useUiStore.getState().select(target)} title="Select in rack">
          {content}
        </button>
      ) : (
        <div className={cls}>{content}</div>
      )}
    </li>
  );
}

function PoeInput() {
  const value = useDesignStore((s) => s.design.expectedPoeLoadW);
  const setExpectedPoe = useDesignStore((s) => s.setExpectedPoe);
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  useEffect(() => setDraft(value === null ? '' : String(value)), [value]);
  const commit = () => {
    const n = draft.trim() === '' ? null : Number(draft);
    if (n !== null && (!Number.isFinite(n) || n < 0)) {
      setDraft(value === null ? '' : String(value));
      return;
    }
    if (n !== value) setExpectedPoe(n);
  };
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">Expected PoE load</span>
      <span className="flex items-center gap-1">
        <input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={draft}
          placeholder="—"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          className={cx(inputClass, 'h-7 w-20 text-right')}
          aria-label="Expected PoE load in watts"
        />
        <span className="text-xs text-zinc-500">W</span>
      </span>
    </label>
  );
}

export function useDesignStats() {
  const design = useDesignStore((s) => s.design);
  const catalog = useCatalogStore((s) => s.catalog);
  return useMemo(() => computeStats(design, catalog), [design, catalog]);
}

export function StatsPanel() {
  const stats = useDesignStats();
  const { power, ups, poe, weight } = stats;
  const usedPct = stats.rackU ? stats.usedU / stats.rackU : 0;
  const upsTone = ups.count ? (power.typicalWithPoeW > ups.capacityW ? 'bad' : power.maxWithPoeW > ups.capacityW ? 'warn' : 'ok') : undefined;
  const poeTone = poe.expectedLoadW !== null && poe.expectedLoadW > poe.budgetW ? 'bad' : poe.expectedLoadW !== null && poe.expectedLoadW > poe.budgetW * 0.8 ? 'warn' : 'ok';
  const ports = (Object.entries(stats.ports) as [PortType, number][]).sort((a, b) => b[1] - a[1]);
  const order = { error: 0, warning: 1, info: 2 } as const;
  const warnings = [...stats.warnings].sort((a, b) => order[a.severity] - order[b.severity]);

  return (
    <div className="space-y-5">
      <Block title="Space" aside={<span className="text-xs text-zinc-500">{stats.deviceCount} devices · {stats.passiveCount} passive</span>}>
        <Row label="Used" value={`${stats.usedU} / ${stats.rackU}U`} />
        <Meter value={stats.usedU} max={stats.rackU} tone={usedPct >= 1 ? 'warn' : 'ok'} />
        <Row label="Free" value={`${stats.freeU}U`} />
      </Block>

      <Block
        title="Power"
        aside={
          <span className="flex gap-1">
            {power.measuredCount > 0 && <Badge tone="green">{power.measuredCount} measured</Badge>}
            {power.unknownIds.length > 0 && <Badge tone="amber">{power.unknownIds.length} unknown</Badge>}
          </span>
        }
      >
        <Row label="Typical draw" value={fmtW(power.typicalW)} hint="Measured power where set, otherwise catalog typical (falling back to max)" />
        <Row label="Max draw" value={fmtW(power.maxW)} hint="Catalog max excludes PoE output" />
        {poe.expectedLoadW ? <Row label="Max incl. PoE load" value={fmtW(power.maxWithPoeW)} /> : null}
        {ups.count > 0 ? (
          <>
            <Row label={`UPS capacity (${ups.count})`} value={`${fmtW(ups.capacityW)}${ups.capacityVA ? ` / ${ups.capacityVA} VA` : ''}`} />
            <Meter value={power.maxWithPoeW} max={ups.capacityW} tone={upsTone} />
            <p className="text-xs text-zinc-500">
              {Math.round((power.maxWithPoeW / ups.capacityW) * 100)}% of UPS capacity at max draw
              {ups.capacityW > power.maxWithPoeW ? `, ${fmtW(Math.round(ups.capacityW - power.maxWithPoeW))} headroom` : ''}
            </p>
          </>
        ) : (
          <p className="text-xs text-zinc-500">No UPS in this rack.</p>
        )}
        {power.estimatedCount > 0 && (
          <p className="text-xs text-zinc-500">
            {power.estimatedCount} device{power.estimatedCount === 1 ? '' : 's'} only publish one power figure; it's used for both typical and max.
          </p>
        )}
      </Block>

      {stats.powerSupply.relevant && stats.powerSupply.needs.length > 0 && (
        <Block
          title="Power sources"
          aside={
            <span className="text-xs text-zinc-500">
              {stats.powerSupply.outletsNeeded} outlet{stats.powerSupply.outletsNeeded === 1 ? '' : 's'} needed · {stats.powerSupply.mainsSockets + stats.powerSupply.iecOutlets} in rack
            </span>
          }
        >
          <ul className="space-y-1 text-xs">
            {stats.powerSupply.needs.map((n) => (
              <li key={n.placementId} className="flex justify-between gap-2">
                <span className="truncate text-zinc-700 dark:text-zinc-300" title={n.name}>
                  {n.name}
                </span>
                <span className={n.inferred ? 'shrink-0 text-right text-zinc-400 italic' : 'shrink-0 text-right text-zinc-500'} title={n.input.notes ?? n.summary}>
                  {n.inferred ? 'IEC (assumed)' : n.summary.replace(/ inlet$/, '')}
                </span>
              </li>
            ))}
          </ul>
          {stats.powerSupply.plugPackIds.length > 0 && (
            <p className="text-xs text-zinc-500">
              {stats.powerSupply.plugPackIds.length} plug-pack{stats.powerSupply.plugPackIds.length === 1 ? '' : 's'}: a 10″ power board with spaced outlets, or one with USB-C outputs, saves room.
            </p>
          )}
        </Block>
      )}

      <Block title="PoE">
        <Row label={`Budget (${poe.sourceCount} source${poe.sourceCount === 1 ? '' : 's'})`} value={fmtW(poe.budgetW)} />
        <PoeInput />
        {poe.budgetW > 0 && poe.expectedLoadW !== null && <Meter value={poe.expectedLoadW} max={poe.budgetW} tone={poeTone} />}
      </Block>

      <Block title="Weight">
        <Row label="Total" value={`${weight.totalKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`} />
        {weight.unknownIds.length > 0 && <p className="text-xs text-zinc-500">{weight.unknownIds.length} device(s) have no published weight.</p>}
      </Block>

      {ports.length > 0 && (
        <Block title="Ports">
          <div className="flex flex-wrap gap-1">
            {ports.map(([type, n]) => (
              <Badge key={type}>
                {n}× {PORT_TYPE_LABELS[type]}
              </Badge>
            ))}
          </div>
        </Block>
      )}

      <Block title="Cables">
        {stats.cables.count === 0 ? (
          <p className="text-xs text-zinc-500">No cables yet. Turn on Cables mode (C) and click two ports.</p>
        ) : (
          <>
            <Row label="Count" value={stats.cables.count} />
            <div className="flex flex-wrap gap-1">
              {(Object.entries(stats.cables.byType) as [CableType, number][]).map(([t, n]) => (
                <Badge key={t}>
                  {n}× {CABLE_TYPE_LABELS[t]}
                </Badge>
              ))}
            </div>
            <Row label="Total length" value={`${stats.cables.totalLengthM} m`} />
            {stats.cables.withoutLength > 0 && <p className="text-xs text-zinc-500">{stats.cables.withoutLength} cable(s) have no length set.</p>}
          </>
        )}
      </Block>

      <Block title={`Warnings (${warnings.length})`}>
        {warnings.length === 0 ? (
          <p className="text-sm text-zinc-500">No problems found.</p>
        ) : (
          <ul className="space-y-1.5">
            {warnings.map((w, i) => (
              <WarningItem key={`${w.code}-${i}`} w={w} />
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}
