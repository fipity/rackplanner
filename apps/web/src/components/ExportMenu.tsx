import { Download, FileJson, FileSpreadsheet, FileText, Image, Printer } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import { designPath, navigate } from '../lib/router';
import { toast } from '../lib/toast';
import { useCatalogStore } from '../store/catalogStore';
import { useDesignStore } from '../store/designStore';
import { Button, cx } from './ui';

type Action = { label: string; icon: ComponentType<{ className?: string }>; run: () => Promise<void> | void } | 'sep';

export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [printStyle, setPrintStyle] = useState(false);
  const o = () => ({ leds: !printStyle });

  const withExport = (fn: (m: typeof import('../lib/export')) => Promise<void> | void) => async () => {
    setOpen(false);
    setBusy(true);
    try {
      const mod = await import('../lib/export');
      await fn(mod);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export failed', 'error');
    } finally {
      setBusy(false);
    }
  };
  const d = () => useDesignStore.getState().design;
  const c = () => useCatalogStore.getState().catalog;

  const actions: Action[] = [
    { label: 'PDF (views + parts list)', icon: FileText, run: withExport((m) => m.exportPdf(d(), c(), o())) },
    'sep',
    { label: 'PNG: front + rear', icon: Image, run: withExport((m) => m.exportPng(d(), c(), 'both', o())) },
    { label: 'PNG: front', icon: Image, run: withExport((m) => m.exportPng(d(), c(), 'front', o())) },
    { label: 'PNG: rear', icon: Image, run: withExport((m) => m.exportPng(d(), c(), 'rear', o())) },
    { label: 'SVG: front + rear', icon: Image, run: withExport((m) => m.exportSvg(d(), c(), 'both', o())) },
    { label: 'SVG: front', icon: Image, run: withExport((m) => m.exportSvg(d(), c(), 'front', o())) },
    { label: 'SVG: rear', icon: Image, run: withExport((m) => m.exportSvg(d(), c(), 'rear', o())) },
    'sep',
    { label: 'CSV bill of materials', icon: FileSpreadsheet, run: withExport((m) => m.exportCsv(d(), c())) },
    { label: 'JSON (full design)', icon: FileJson, run: withExport((m) => m.exportJson(d(), c())) },
    'sep',
    {
      label: 'Printable view',
      icon: Printer,
      run: () => {
        setOpen(false);
        navigate(`${designPath(d().id)}/print`);
      },
    },
  ];

  return (
    <div className="relative">
      <Button aria-label="Export" aria-haspopup="menu" aria-expanded={open} title="Export & print" onClick={() => setOpen((o) => !o)} disabled={busy}>
        <Download className={cx('size-4', busy && 'animate-pulse')} />
        <span className="max-sm:hidden">{busy ? 'Exporting…' : 'Export'}</span>
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-40 mt-1 w-64 rounded-lg border border-zinc-200 bg-white p-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-zinc-600 dark:text-zinc-300">
              <input type="checkbox" checked={printStyle} onChange={(e) => setPrintStyle(e.target.checked)} className="accent-blue-600" />
              Print style (LEDs off)
            </label>
            <p className="px-2 pb-1 text-xs text-zinc-500">Images and PDFs always use full detail.</p>
            <div className="my-1 h-px bg-zinc-200 dark:bg-zinc-800" />
            {actions.map((a, i) =>
              a === 'sep' ? (
                <div key={i} className="my-1 h-px bg-zinc-200 dark:bg-zinc-800" />
              ) : (
                <button
                  key={a.label}
                  type="button"
                  role="menuitem"
                  onClick={() => void a.run()}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <a.icon className="size-4 text-zinc-500" /> {a.label}
                </button>
              ),
            )}
          </div>
        </>
      )}
    </div>
  );
}
