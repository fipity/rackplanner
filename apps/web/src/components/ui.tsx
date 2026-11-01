import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; variant?: 'default' | 'danger' | 'primary' };

export function Button({ className, active, variant = 'default', ...props }: BtnProps) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-blue-500',
        variant === 'default' &&
          (active
            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
            : 'text-zinc-700 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-800'),
        variant === 'primary' && 'bg-blue-600 text-white hover:bg-blue-500',
        variant === 'danger' && 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50',
        className,
      )}
    />
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md bg-zinc-200/70 p-0.5 dark:bg-zinc-800">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-7 rounded px-2.5 text-sm font-medium transition-colors',
            value === o.value
              ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-600 dark:text-white'
              : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const inputClass =
  'h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

export const selectClass =
  'h-8 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

export function Badge({ children, tone = 'default', title }: { children: ReactNode; tone?: 'default' | 'blue' | 'amber' | 'green'; title?: string }) {
  return (
    <span
      title={title}
      className={cx(
        'inline-flex items-center rounded px-1.5 py-px text-[11px] font-semibold leading-4',
        tone === 'default' && 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
        tone === 'blue' && 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
        tone === 'amber' && 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
        tone === 'green' && 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
      )}
    >
      {children}
    </span>
  );
}
