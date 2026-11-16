import { withTurnedParts, type Catalog, type Design } from '@rackplanner/shared';
import { FileJson, FileText } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '../components/ui';
import { ApiError, getSharedDesign, type SharedDesign } from '../lib/api';
import { exportPaletteStyle } from '../lib/export/palette';
import { toast } from '../lib/toast';
import { PrintSheet, SheetToolbar } from './PrintPage';

/**
 * Read-only view of a design behind a share link. Works without the app's
 * login: it only uses /api/shared/:token, which carries the parts it needs.
 */
export function SharedPage({ token }: { token: string }) {
  const [data, setData] = useState<SharedDesign | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    getSharedDesign(token).then(
      (r) => {
        setData(r);
        document.title = `${r.design.name} · RackPlanner`;
      },
      (e) => setError(e instanceof ApiError && e.status === 404 ? 'This share link has been turned off or never existed.' : e instanceof Error ? e.message : String(e)),
    );
  }, [token]);

  const catalog: Catalog = useMemo(() => new Map(withTurnedParts(data?.parts ?? []).map((p) => [p.id, p])), [data]);

  if (error)
    return (
      <div className="m-auto max-w-md p-6 text-center">
        <p className="mb-2 font-semibold">Can't open this design</p>
        <p className="text-sm text-zinc-500">{error}</p>
      </div>
    );
  if (!data) return <p className="m-auto p-6 text-sm text-zinc-500">Loading…</p>;

  const design: Design = data.design;
  const run = (fn: (m: typeof import('../lib/export')) => Promise<void> | void) => async () => {
    try {
      await fn(await import('../lib/export'));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export failed', 'error');
    }
  };

  return (
    <div className="min-h-full overflow-y-auto bg-white text-zinc-900 print:overflow-visible" style={exportPaletteStyle}>
      <SheetToolbar>
        <span className="mr-auto flex items-center gap-2 text-sm text-zinc-600">
          <img src="/favicon.svg" alt="" className="size-5" />
          Shared with you · read-only
        </span>
        <Button className="text-zinc-700 hover:bg-zinc-100" onClick={run((m) => m.exportPdf(design, catalog))}>
          <FileText className="size-4" /> PDF
        </Button>
        <Button className="text-zinc-700 hover:bg-zinc-100" title="Import this into your own RackPlanner" onClick={run((m) => m.exportJson(design, catalog))}>
          <FileJson className="size-4" /> JSON
        </Button>
      </SheetToolbar>
      <PrintSheet design={design} catalog={catalog} stamp={`updated ${new Date(design.updatedAt).toLocaleDateString()}`} />
    </div>
  );
}
