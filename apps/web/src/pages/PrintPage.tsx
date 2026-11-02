import { PORT_TYPE_LABELS, buildBom, computeStats, type Design, type PortType } from '@rackplanner/shared';
import { ArrowLeft, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RackView } from '../components/rack/RackView';
import { Button } from '../components/ui';
import { getDesign } from '../lib/api';
import { exportPaletteStyle } from '../lib/export/palette';
import { designPath, navigate } from '../lib/router';
import { useCatalogStore } from '../store/catalogStore';

/** Print-friendly page: both views, stats and the parts list. Always light. */
export function PrintPage({ id }: { id: string }) {
  const [design, setDesign] = useState<Design | null>(null);
  const [error, setError] = useState('');
  const catalog = useCatalogStore((s) => s.catalog);
  const ready = useCatalogStore((s) => s.status === 'ready');

  useEffect(() => {
    getDesign(id).then(
      (r) => setDesign(r.design),
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [id]);

  if (error) return <p className="m-auto p-6 text-sm text-red-600">{error}</p>;
  if (!design || !ready) return <p className="m-auto p-6 text-sm text-zinc-500">Loading…</p>;

  const stats = computeStats(design, catalog);
  const bom = buildBom(design, catalog);
  const ports = (Object.entries(stats.ports) as [PortType, number][]).sort((a, b) => b[1] - a[1]);

  return (
    <div className="min-h-full overflow-y-auto bg-white text-zinc-900 print:overflow-visible" style={exportPaletteStyle}>
      <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-zinc-200 bg-white/95 px-4 py-2 backdrop-blur print:hidden">
        <Button className="text-zinc-700 hover:bg-zinc-100" onClick={() => navigate(designPath(id))}>
          <ArrowLeft className="size-4" /> Back to editor
        </Button>
        <Button variant="primary" onClick={() => window.print()}>
          <Printer className="size-4" /> Print
        </Button>
      </div>
      <article className="mx-auto max-w-5xl space-y-6 p-6 print:max-w-none print:p-0">
        <header>
          <h1 className="text-2xl font-bold">{design.name}</h1>
          <p className="text-sm text-zinc-600">
            {design.rack.heightU}U {design.rack.width === '19in' ? '19″' : '10″'} rack
            {design.rack.depthMm ? ` · ${design.rack.depthMm} mm deep` : ''} · {design.placements.length} devices · printed {new Date().toLocaleDateString()}
          </p>
        </header>

        <section className="grid grid-cols-2 gap-6 break-inside-avoid">
          {(['front', 'rear'] as const).map((v) => (
            <figure key={v} className="text-center">
              <figcaption className="mb-1 text-sm font-semibold">{v === 'front' ? 'Front' : 'Rear'}</figcaption>
              <RackView design={design} catalog={catalog} view={v} cables={design.cables} className="mx-auto h-auto max-h-[80vh] w-full print:max-h-[22cm]" />
            </figure>
          ))}
        </section>

        <section className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm break-inside-avoid sm:grid-cols-3">
          <div>
            <b>Space:</b> {stats.usedU}U used, {stats.freeU}U free
          </div>
          <div>
            <b>Power:</b> {stats.power.typicalW} W typical / {stats.power.maxW} W max
          </div>
          <div>
            <b>UPS:</b> {stats.ups.count ? `${stats.ups.capacityW} W` : 'none'}
          </div>
          <div>
            <b>PoE budget:</b> {stats.poe.budgetW} W{stats.poe.expectedLoadW !== null ? ` (expected ${stats.poe.expectedLoadW} W)` : ''}
          </div>
          <div>
            <b>Weight:</b> {stats.weight.totalKg} kg
          </div>
          <div>
            <b>Ports:</b> {ports.map(([t, n]) => `${n}× ${PORT_TYPE_LABELS[t]}`).join(', ') || '—'}
          </div>
        </section>

        {stats.warnings.length > 0 && (
          <section className="break-inside-avoid">
            <h2 className="mb-1 text-base font-semibold">Warnings</h2>
            <ul className="list-disc pl-5 text-sm">
              {stats.warnings.map((w, i) => (
                <li key={i}>{w.message}</li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-2 text-base font-semibold">Parts list</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-zinc-300 text-left">
                {['Qty', 'Brand', 'Model', 'Name / labels', 'U', 'Typ W', 'Max W', 'kg'].map((h) => (
                  <th key={h} className="px-1.5 py-1 font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bom.map((r) => (
                <tr key={r.partId} className="border-b border-zinc-200 align-top break-inside-avoid">
                  <td className="px-1.5 py-1 tabular-nums">{r.qty}</td>
                  <td className="px-1.5 py-1">{r.brand}</td>
                  <td className="px-1.5 py-1">{r.model}</td>
                  <td className="px-1.5 py-1">
                    {r.name}
                    {r.labels.length > 0 && <div className="text-xs text-zinc-500">{r.labels.join(', ')}</div>}
                  </td>
                  <td className="px-1.5 py-1 tabular-nums">{r.totalU || r.heightU}</td>
                  <td className="px-1.5 py-1 tabular-nums">{r.measuredW !== null ? `${r.measuredW}*` : (r.typicalW ?? '—')}</td>
                  <td className="px-1.5 py-1 tabular-nums">{r.maxW ?? '—'}</td>
                  <td className="px-1.5 py-1 tabular-nums">{r.weightKg !== null ? +(r.weightKg * r.qty).toFixed(2) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {bom.some((r) => r.measuredW !== null) && <p className="mt-1 text-xs text-zinc-500">* measured power (total for that line)</p>}
        </section>
      </article>
    </div>
  );
}
