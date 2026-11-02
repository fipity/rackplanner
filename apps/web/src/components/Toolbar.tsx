import { MAX_RACK_U, MIN_RACK_U, RACK_DEPTH_PRESETS, RACK_HEIGHT_PRESETS, type Rack, type RackChangeResult } from '@rackplanner/shared';
import { ArrowDown01, ArrowUp01, Cable, Eye, EyeOff, Maximize, Minus, Monitor, Moon, Plus, Redo2, Sun, Undo2, ZoomIn, ZoomOut } from 'lucide-react';
import { useState } from 'react';
import { commitRackChange, previewRackChange } from '../lib/actions';
import { useDesignStore, useHistory } from '../store/designStore';
import { useUiStore, type Theme } from '../store/uiStore';
import { ConfirmDialog } from './ConfirmDialog';
import { Button, Segmented, selectClass } from './ui';

const ALL_HEIGHTS = Array.from({ length: MAX_RACK_U - MIN_RACK_U + 1 }, (_, i) => i + MIN_RACK_U);

export function Toolbar() {
  const rack = useDesignStore((s) => s.design.rack);
  const { canUndo, canRedo, undo, redo } = useHistory();
  const { view, setView, zoom, fitScale, zoomBy, setZoom, theme, setTheme, cableMode, setCableMode, showCables, setShowCables } = useUiStore();
  const [pending, setPending] = useState<{ rack: Rack; result: RackChangeResult } | null>(null);

  const requestRack = (patch: Partial<Rack>) => {
    const next = { ...rack, ...patch };
    const result = previewRackChange(next);
    if (result.removed.length) setPending({ rack: next, result });
    else commitRackChange(next, result);
  };

  const scale = zoom === 'fit' ? fitScale : zoom;
  const nextTheme: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };
  const ThemeIcon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Segmented
        label="Rack width"
        value={rack.width}
        onChange={(width) => requestRack({ width })}
        options={[
          { value: '19in', label: '19″' },
          { value: '10in', label: '10″' },
        ]}
      />

      <div className="flex items-center gap-1">
        <Button aria-label="Decrease rack height" disabled={rack.heightU <= MIN_RACK_U} onClick={() => requestRack({ heightU: rack.heightU - 1 })} className="px-1.5">
          <Minus className="size-4" />
        </Button>
        <select aria-label="Rack height" className={selectClass} value={rack.heightU} onChange={(e) => requestRack({ heightU: Number(e.target.value) })}>
          <optgroup label="Presets">
            {RACK_HEIGHT_PRESETS.map((u) => (
              <option key={`p${u}`} value={u}>
                {u}U
              </option>
            ))}
          </optgroup>
          <optgroup label="All sizes">
            {ALL_HEIGHTS.filter((u) => !(RACK_HEIGHT_PRESETS as readonly number[]).includes(u)).map((u) => (
              <option key={u} value={u}>
                {u}U
              </option>
            ))}
          </optgroup>
        </select>
        <Button aria-label="Increase rack height" disabled={rack.heightU >= MAX_RACK_U} onClick={() => requestRack({ heightU: rack.heightU + 1 })} className="px-1.5">
          <Plus className="size-4" />
        </Button>
      </div>

      <select
        aria-label="Rack depth"
        title="Rack depth: used to flag devices that are too deep"
        className={selectClass}
        value={rack.depthMm ?? ''}
        onChange={(e) => requestRack({ depthMm: e.target.value ? Number(e.target.value) : null })}
      >
        <option value="">Depth: any</option>
        {RACK_DEPTH_PRESETS.map((d) => (
          <option key={d} value={d}>
            {d} mm deep
          </option>
        ))}
      </select>

      <Button
        title={rack.numbering === 'bottom-up' ? 'U1 at the bottom (click for top-down)' : 'U1 at the top (click for bottom-up)'}
        aria-label="Toggle U numbering direction"
        onClick={() => requestRack({ numbering: rack.numbering === 'bottom-up' ? 'top-down' : 'bottom-up' })}
      >
        {rack.numbering === 'bottom-up' ? <ArrowUp01 className="size-4" /> : <ArrowDown01 className="size-4" />}
      </Button>

      <div className="h-6 w-px bg-zinc-300 dark:bg-zinc-700" />

      <Segmented
        label="View"
        value={view}
        onChange={setView}
        options={[
          { value: 'front', label: 'Front' },
          { value: 'rear', label: 'Rear' },
        ]}
      />

      <div className="flex items-center gap-0.5">
        <Button
          aria-label="Cable mode"
          aria-pressed={cableMode}
          title="Draw cables between ports (C)"
          active={cableMode}
          onClick={() => setCableMode(!cableMode)}
          className={cableMode ? '!bg-amber-500 !text-zinc-950' : ''}
        >
          <Cable className="size-4" />
          <span className="max-xl:hidden">Cables</span>
        </Button>
        <Button aria-label={showCables ? 'Hide cables' : 'Show cables'} title={showCables ? 'Hide cables' : 'Show cables'} className="px-1.5" onClick={() => setShowCables(!showCables)} disabled={cableMode}>
          {showCables ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
        </Button>
      </div>

      <div className="flex items-center">
        <Button aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={undo} className="px-1.5">
          <Undo2 className="size-4" />
        </Button>
        <Button aria-label="Redo" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo} className="px-1.5">
          <Redo2 className="size-4" />
        </Button>
      </div>

      <div className="flex items-center">
        <Button aria-label="Zoom out" onClick={() => zoomBy(1 / 1.2)} className="px-1.5">
          <ZoomOut className="size-4" />
        </Button>
        <span className="w-12 text-center text-xs tabular-nums text-zinc-500">{Math.round(scale * 100)}%</span>
        <Button aria-label="Zoom in" onClick={() => zoomBy(1.2)} className="px-1.5">
          <ZoomIn className="size-4" />
        </Button>
        <Button aria-label="Fit to screen" title="Fit to screen (0)" active={zoom === 'fit'} onClick={() => setZoom('fit')} className="px-1.5">
          <Maximize className="size-4" />
        </Button>
      </div>

      <Button aria-label={`Theme: ${theme}`} title={`Theme: ${theme}`} onClick={() => setTheme(nextTheme[theme])} className="px-1.5">
        <ThemeIcon className="size-4" />
      </Button>

      {pending && (
        <ConfirmDialog
          title="Some parts no longer fit"
          confirmLabel={`Remove ${pending.result.removed.length} and apply`}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            commitRackChange(pending.rack, pending.result);
            setPending(null);
          }}
        >
          <p className="mb-2">This change would remove these parts (you can undo afterwards):</p>
          <ul className="max-h-60 space-y-1 overflow-y-auto">
            {pending.result.removed.map((r) => (
              <li key={r.placementId} className="rounded bg-zinc-100 px-2 py-1 dark:bg-zinc-800">
                <span className="font-medium">{r.name}</span>
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">{r.reason}</span>
              </li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </div>
  );
}
