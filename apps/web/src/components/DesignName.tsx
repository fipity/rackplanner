import { useEffect, useState } from 'react';
import { useDesignStore } from '../store/designStore';
import { cx } from './ui';

/** Inline-editable design name for the editor header. */
export function DesignName() {
  const name = useDesignStore((s) => s.design.name);
  const setName = useDesignStore((s) => s.setName);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  const commit = () => {
    const v = draft.trim();
    if (v && v !== name) setName(v.slice(0, 200));
    else setDraft(name);
  };
  return (
    <input
      aria-label="Design name"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(name);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cx(
        'h-8 w-44 min-w-0 rounded-md border border-transparent bg-transparent px-2 text-sm font-semibold sm:w-56',
        'hover:border-zinc-300 focus:border-blue-500 focus:outline-none dark:hover:border-zinc-700',
      )}
    />
  );
}
