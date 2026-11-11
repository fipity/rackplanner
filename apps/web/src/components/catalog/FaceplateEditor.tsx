/**
 * Faceplate region editor for the custom part builder: a list of regions per
 * face (ports, bays, display, vents…) with fractional positions, edited as
 * strings and converted to the shared layout schema.
 */
import { CONNECTORS, PORT_TYPES, PORT_TYPE_LABELS, STYLE_PRESETS, type Part, type PortType, type StylePreset, autoFaceLayout } from '@rackplanner/shared';
import { COUNTED, FEATURES, blankRegion, isPort, regionToDraft, type FaceKey, type RegionDraft } from './regionDraft';

export { draftToRegion, regionToDraft, type FaceKey, type RegionDraft } from './regionDraft';
import { ArrowDown, ArrowUp, Plus, Trash2, Wand2 } from 'lucide-react';
import { PRESET_LABELS } from '../faceplates/presets';
import { Button, cx, inputClass, selectClass } from '../ui';

interface Props {
  face: FaceKey;
  setFace: (f: FaceKey) => void;
  preset: StylePreset | '';
  setPreset: (p: StylePreset | '') => void;
  custom: boolean;
  setCustom: (v: boolean) => void;
  regions: Record<FaceKey, RegionDraft[]>;
  setRegions: (face: FaceKey, list: RegionDraft[]) => void;
  /** Last valid part, to seed regions from the generated layout. */
  preview: Part | null;
  /** Problems with the custom layout (port counts etc.). */
  problems: string[];
}

export function FaceplateEditor({ face, setFace, preset, setPreset, custom, setCustom, regions, setRegions, preview, problems }: Props) {
  const list = regions[face];
  const update = (i: number, patch: Partial<RegionDraft>) => setRegions(face, list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, by: number) => {
    const next = [...list];
    const [r] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + by)), 0, r!);
    setRegions(face, next);
  };
  const seed = () => {
    if (!preview) return;
    setCustom(true);
    for (const f of ['front', 'rear'] as const) {
      const src = preview.layout?.[f] ?? autoFaceLayout(preview, f);
      setRegions(f, src.regions.map(regionToDraft));
    }
  };
  const small = cx(inputClass, 'h-7 px-1.5 text-xs');
  const smallSel = cx(selectClass, 'h-7 px-1 text-xs');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">
          <span className="block">Style preset</span>
          <select aria-label="Style preset" className={cx(selectClass, 'w-56')} value={preset} onChange={(e) => setPreset(e.target.value as StylePreset | '')}>
            <option value="">Automatic (from brand & finish)</option>
            {STYLE_PRESETS.map((p) => (
              <option key={p} value={p}>
                {PRESET_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-8 items-center gap-2 text-sm">
          <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} /> Custom layout
        </label>
        <Button onClick={seed} disabled={!preview} title="Copy the current (generated) front and rear into editable regions" className="border border-zinc-300 dark:border-zinc-700">
          <Wand2 className="size-4" /> Start from generated layout
        </Button>
      </div>

      {!custom ? (
        <p className="text-xs text-zinc-500">The faceplate is generated from the ports, bays and style above. Tick “Custom layout” to place regions yourself.</p>
      ) : (
        <>
          <div role="tablist" aria-label="Face" className="inline-flex rounded-md bg-zinc-200/70 p-0.5 text-xs dark:bg-zinc-800">
            {(['front', 'rear'] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={face === f}
                onClick={() => setFace(f)}
                className={cx('rounded px-3 py-1 font-medium', face === f ? 'bg-white shadow-sm dark:bg-zinc-700' : 'text-zinc-500')}
              >
                {f === 'front' ? 'Front' : 'Rear'} ({regions[f].length})
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500">x / w / y / h are % of the face. Leave x blank to follow the previous region; leave w blank for the natural size.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-xs">
              <thead className="text-left text-zinc-500">
                <tr>
                  <th className="pb-1 font-medium">Type</th>
                  <th className="pb-1 font-medium">Count</th>
                  <th className="pb-1 font-medium">x %</th>
                  <th className="pb-1 font-medium">w %</th>
                  <th className="pb-1 font-medium">y %</th>
                  <th className="pb-1 font-medium">h %</th>
                  <th className="pb-1 font-medium">Rows</th>
                  <th className="pb-1 font-medium">PoE / text</th>
                  <th className="pb-1 font-medium">Counts as</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => {
                  const port = isPort(r.type);
                  return (
                    <tr key={i} className="align-middle">
                      <td className="py-0.5 pr-1">
                        <select aria-label={`Region ${i + 1} type`} className={smallSel} value={r.type} onChange={(e) => update(i, { type: e.target.value, extra: {} })}>
                          <optgroup label="Ports">
                            {CONNECTORS.map((c) => (
                              <option key={c} value={c}>
                                {c.replace(/_/g, ' ')}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Features">
                            {FEATURES.map((c) => (
                              <option key={c} value={c}>
                                {c.replace(/_/g, ' ')}
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      </td>
                      <td className="pr-1">
                        <input aria-label={`Region ${i + 1} count`} className={small} style={{ width: '3.5rem' }} type="number" min={1} disabled={!port && !COUNTED.has(r.type)} value={r.count} onChange={(e) => update(i, { count: e.target.value })} />
                      </td>
                      {(['x', 'w', 'y', 'h'] as const).map((k) => (
                        <td key={k} className="pr-1">
                          <input aria-label={`Region ${i + 1} ${k}`} className={small} style={{ width: '3.5rem' }} type="number" min={0} max={100} step="0.5" value={r[k]} onChange={(e) => update(i, { [k]: e.target.value })} />
                        </td>
                      ))}
                      <td className="pr-1">
                        <input aria-label={`Region ${i + 1} rows`} className={small} style={{ width: '2.75rem' }} type="number" min={1} max={4} disabled={!port && r.type !== 'bays'} value={r.rows} onChange={(e) => update(i, { rows: e.target.value })} />
                      </td>
                      <td className="pr-1">
                        {r.type === 'label' ? (
                          <input aria-label={`Region ${i + 1} text`} className={small} style={{ width: '6rem' }} value={r.text} placeholder="model" onChange={(e) => update(i, { text: e.target.value })} />
                        ) : (
                          <select aria-label={`Region ${i + 1} PoE`} className={smallSel} disabled={!port} value={r.poe} onChange={(e) => update(i, { poe: e.target.value })}>
                            <option value="">—</option>
                            <option value="poe">PoE</option>
                            <option value="poe+">PoE+</option>
                            <option value="poe++">PoE++</option>
                            <option value="poe+++">PoE+++</option>
                          </select>
                        )}
                      </td>
                      <td className="pr-1">
                        <select aria-label={`Region ${i + 1} counts as`} className={smallSel} disabled={!port} value={r.portType} onChange={(e) => update(i, { portType: e.target.value })}>
                          <option value="">auto</option>
                          <option value="none">not a port</option>
                          {PORT_TYPES.map((t: PortType) => (
                            <option key={t} value={t}>
                              {PORT_TYPE_LABELS[t]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="whitespace-nowrap">
                        <button type="button" aria-label="Move up" className="p-0.5 text-zinc-500 hover:text-zinc-900 disabled:opacity-30 dark:hover:text-zinc-100" disabled={i === 0} onClick={() => move(i, -1)}>
                          <ArrowUp className="size-3.5" />
                        </button>
                        <button type="button" aria-label="Move down" className="p-0.5 text-zinc-500 hover:text-zinc-900 disabled:opacity-30 dark:hover:text-zinc-100" disabled={i === list.length - 1} onClick={() => move(i, 1)}>
                          <ArrowDown className="size-3.5" />
                        </button>
                        <button type="button" aria-label="Remove region" className="p-0.5 text-red-600" onClick={() => setRegions(face, list.filter((_, j) => j !== i))}>
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-1">
            {['rj45', 'sfp_plus', 'usb_a', 'iec_c14', 'keystone', 'bays', 'display', 'vent', 'fan', 'psu', 'leds', 'label'].map((t) => (
              <Button key={t} onClick={() => setRegions(face, [...list, blankRegion(t)])} className="h-7 border border-dashed border-zinc-300 px-2 text-xs dark:border-zinc-700">
                <Plus className="size-3.5" /> {t.replace(/_/g, ' ')}
              </Button>
            ))}
          </div>
          {problems.length > 0 && (
            <ul className="space-y-0.5 text-xs text-amber-700 dark:text-amber-400">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
