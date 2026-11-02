import { X } from 'lucide-react';
import { Inspector } from './inspector/Inspector';
import { StatsPanel, useDesignStats } from './stats/StatsPanel';
import { Button, cx } from './ui';
import { useUiStore } from '../store/uiStore';

export function RightPanel() {
  const { rightTab, setRightTab, selectedId, selectedCableId, setPanelOpen } = useUiStore();
  const stats = useDesignStats();
  const problems = stats.warnings.filter((w) => w.severity !== 'info').length;
  const tab = (id: 'details' | 'stats', label: string, badge?: number) => (
    <button
      type="button"
      role="tab"
      aria-selected={rightTab === id}
      onClick={() => setRightTab(id)}
      className={cx(
        'relative flex-1 py-2.5 text-sm font-medium',
        rightTab === id ? 'text-zinc-900 dark:text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200',
      )}
    >
      {label}
      {badge ? (
        <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-px text-[10px] font-bold text-white">{badge}</span>
      ) : null}
      {rightTab === id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded bg-blue-600" />}
    </button>
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" className="flex items-center border-b border-zinc-200 pr-1 dark:border-zinc-800">
        {tab('details', selectedCableId ? 'Cable' : selectedId ? 'Device' : 'Rack')}
        {tab('stats', 'Stats', problems)}
        <Button
          aria-label="Close panel"
          className="px-1.5 lg:hidden"
          onClick={() => {
            setPanelOpen(false);
            useUiStore.getState().select(null);
            useUiStore.getState().selectCable(null);
          }}
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4" role="tabpanel">
        {rightTab === 'details' ? <Inspector /> : <StatsPanel />}
      </div>
    </div>
  );
}
