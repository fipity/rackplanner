/** Details of a 3D-printed part: picture, designer credit, licence, print status and filament. */
import { PRINT_STATUSES, PRINT_STATUS_LABELS, licenceInfo, type Part, type PlacedPart, type PrintStatus, type PrintedSource } from '@rackplanner/shared';
import { AlertTriangle, ExternalLink, Printer } from 'lucide-react';
import { thumbnailUrl } from '../../lib/api';
import { useDesignStore } from '../../store/designStore';
import { cx, selectClass } from '../ui';

const SITE_LABEL: Record<PrintedSource['site'], string> = { makerworld: 'MakerWorld' };

/** "Designed by X · CC BY-NC-SA (non-commercial)", with links. */
export function PrintedCredit({ source, className }: { source: PrintedSource; className?: string }) {
  const lic = licenceInfo(source.licence);
  const flags = lic ? [lic.nonCommercial && 'Non-commercial', lic.noDerivatives && 'No derivatives'].filter((f): f is string => !!f) : [];
  return (
    <div className={cx('space-y-1 text-xs', className)}>
      <div>
        Design by{' '}
        {source.designer ? (
          source.designerUrl ? (
            <a href={source.designerUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-700 hover:underline dark:text-blue-400">
              {source.designer}
            </a>
          ) : (
            <span className="font-medium">{source.designer}</span>
          )
        ) : (
          <span className="text-zinc-500">unknown designer</span>
        )}{' '}
        on{' '}
        <a href={source.url} target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline dark:text-blue-400">
          {SITE_LABEL[source.site]}
        </a>
      </div>
      <div>
        Licence: <span className="font-medium">{source.licence ?? 'not stated'}</span>
        {source.profileName && <span className="text-zinc-500"> · profile “{source.profileName}”</span>}
      </div>
      {flags.length > 0 && (
        <div role="note" className="flex items-center gap-1 rounded bg-amber-50 px-2 py-1 font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
          <AlertTriangle className="size-3.5 shrink-0" /> {flags.join(' · ')}: {lic?.nonCommercial ? 'don’t sell prints' : ''}
          {lic?.nonCommercial && lic.noDerivatives ? '; ' : ''}
          {lic?.noDerivatives ? 'don’t share modified versions' : ''}
        </div>
      )}
    </div>
  );
}

export function PrintedDetails({ placement, part }: { placement: PlacedPart; part: Part }) {
  const updatePlacement = useDesignStore((s) => s.updatePlacement);
  const printed = part.printed!;
  const status = placement.print?.status ?? printed.status;
  const filament = placement.print?.filament ?? printed.filament;
  const setPrint = (patch: { status?: PrintStatus; filament?: string }) => {
    const next = { ...placement.print, ...patch };
    // Same as the part's defaults: store nothing.
    if (next.status === printed.status) delete next.status;
    if (next.filament === printed.filament) delete next.filament;
    updatePlacement(placement.id, { print: Object.keys(next).length ? next : undefined });
  };
  return (
    <section aria-label="3D-printed part" className="space-y-2 rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
      <div className="flex gap-2.5">
        {printed.thumbnail ? (
          <img src={thumbnailUrl(printed.thumbnail)} alt={`${printed.source.title ?? part.name} (model picture)`} className="size-20 shrink-0 rounded-md border border-zinc-200 object-cover dark:border-zinc-800" />
        ) : (
          <div className="grid size-20 shrink-0 place-items-center rounded-md border border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-700" aria-hidden>
            <Printer className="size-6" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-1 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase">
            <Printer className="size-3.5" /> 3D printed
          </div>
          <PrintedCredit source={printed.source} />
        </div>
      </div>
      <div className="grid grid-cols-[1fr_auto] items-end gap-2">
        <label className="space-y-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Print status
          <select className={cx(selectClass, 'w-full')} value={status} onChange={(e) => setPrint({ status: e.target.value as PrintStatus })}>
            {PRINT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PRINT_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-0.5 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Filament
          <input type="color" aria-label="Filament colour" value={filament} onChange={(e) => setPrint({ filament: e.target.value })} className="block h-8 w-12 cursor-pointer rounded border border-zinc-300 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900" />
        </label>
      </div>
      <a
        href={printed.source.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 text-sm font-medium text-white hover:bg-blue-500"
      >
        <ExternalLink className="size-4" /> View on {SITE_LABEL[printed.source.site]}
      </a>
    </section>
  );
}
