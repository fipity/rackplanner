/**
 * /_faceplates: one reference device per style preset, front and rear, in
 * the current theme. Used by the visual snapshot tests; handy for checking
 * a preset at a glance.
 */
import { STYLE_PRESETS } from '@rackplanner/shared';
import { PartThumb } from '../components/faceplates/PartThumb';
import { PRESET_LABELS } from '../components/faceplates/presets';
import { referencePart } from '../components/faceplates/reference';
import { useCatalogStore } from '../store/catalogStore';

export function FaceplateGallery() {
  const parts = useCatalogStore((s) => s.parts);
  const ready = useCatalogStore((s) => s.status === 'ready');
  if (!ready) return <p className="m-auto p-6 text-sm text-zinc-500">Loading…</p>;
  return (
    <div className="min-h-full overflow-y-auto p-6">
      <h1 className="mb-4 text-xl font-semibold">Faceplate style presets</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        {STYLE_PRESETS.map((preset) => {
          const part = referencePart(parts, preset);
          if (!part) return null;
          const rackWidth = part.rackWidths.includes('19in') && part.width !== '10in' ? '19in' : '10in';
          return (
            <section key={preset} data-preset={preset} className="space-y-2 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
              <h2 className="text-sm font-semibold">
                {PRESET_LABELS[preset]} <span className="font-normal text-zinc-500">· {part.name}</span>
              </h2>
              {(['front', 'rear'] as const).map((face) => (
                <div key={face} data-face={face} className="w-fit">
                  <PartThumb part={part} rackWidth={rackWidth} width={560} view={face} lod="high" />
                </div>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
