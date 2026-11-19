/** "Parts to print" for a design: every 3D-printed part with its picture, colour, status and model link. Printable; exports CSV / Markdown. */
import { PRINT_STATUS_LABELS, TO_PRINT, partsToPrint, partsToPrintCsv, partsToPrintMarkdown, type Design } from '@rackplanner/shared';
import { ArrowLeft, FileDown, Printer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PrintedCredit } from '../components/inspector/PrintedDetails';
import { Button } from '../components/ui';
import { getDesign, thumbnailUrl } from '../lib/api';
import { download, fileStem } from '../lib/export/download';
import { designPath, navigate } from '../lib/router';
import { useCatalogStore } from '../store/catalogStore';

export function PartsToPrintPage({ id }: { id: string }) {
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

  const rows = partsToPrint(design, catalog);
  const left = rows.filter((r) => TO_PRINT.has(r.status)).length;
  return (
    <div className="min-h-full overflow-y-auto bg-white text-zinc-900 print:overflow-visible">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-white/95 px-4 py-2 backdrop-blur print:hidden">
        <Button className="text-zinc-700 hover:bg-zinc-100" onClick={() => navigate(designPath(id))}>
          <ArrowLeft className="size-4" /> Back to editor
        </Button>
        <Button variant="primary" onClick={() => window.print()}>
          <Printer className="size-4" /> Print
        </Button>
        <Button className="text-zinc-700 hover:bg-zinc-100" onClick={() => download(new Blob([partsToPrintCsv(rows)], { type: 'text/csv;charset=utf-8' }), `${fileStem(design)}-parts-to-print.csv`)}>
          <FileDown className="size-4" /> CSV
        </Button>
        <Button
          className="text-zinc-700 hover:bg-zinc-100"
          onClick={() => download(new Blob([partsToPrintMarkdown(design.name, rows)], { type: 'text/markdown;charset=utf-8' }), `${fileStem(design)}-parts-to-print.md`)}
        >
          <FileDown className="size-4" /> Markdown
        </Button>
      </div>
      <article className="mx-auto max-w-4xl space-y-4 p-6 print:max-w-none print:p-0">
        <header>
          <h1 className="text-2xl font-bold">Parts to print: {design.name}</h1>
          <p className="text-sm text-zinc-600">
            {rows.length} 3D-printed part{rows.length === 1 ? '' : 's'}, {left} still to print.
          </p>
        </header>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">This design has no 3D-printed parts yet. Use “Add 3D-printed part” in the catalog.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 border-y border-zinc-200">
            {rows.map((r) => (
              <li key={r.placementId} className="flex gap-4 py-3 break-inside-avoid">
                {r.thumbnail ? (
                  <img src={thumbnailUrl(r.thumbnail)} alt="" className="size-24 shrink-0 rounded-md border border-zinc-200 object-cover" />
                ) : (
                  <div className="grid size-24 shrink-0 place-items-center rounded-md border border-dashed border-zinc-300 text-zinc-400">
                    <Printer className="size-7" aria-hidden />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{r.name}</span>
                    <span className={`rounded px-1.5 py-px text-[11px] font-semibold ${TO_PRINT.has(r.status) ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                      {PRINT_STATUS_LABELS[r.status]}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-600">
                      <span className="inline-block size-3.5 rounded-sm border border-zinc-400" style={{ background: r.filament }} aria-hidden />
                      {r.filament}
                    </span>
                  </div>
                  {r.name !== r.partName && <div className="text-xs text-zinc-500">{r.partName}</div>}
                  {r.holds.length > 0 && <div className="text-xs text-zinc-600">Holds {r.holds.join(', ')}</div>}
                  <PrintedCredit source={catalog.get(r.partId)!.printed!.source} />
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-blue-700 hover:underline">
                    {r.url}
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-zinc-500">Models belong to their designers; check each licence before sharing or selling prints.</p>
      </article>
    </div>
  );
}
