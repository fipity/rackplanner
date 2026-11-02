/** Minimal history-API router: "/" (home) and "/d/:id" (editor). */
import { useSyncExternalStore } from 'react';

export type Route = { name: 'home' } | { name: 'design'; id: string } | { name: 'notfound' };

export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { name: 'home' };
  const m = /^\/d\/([^/]+)\/?$/.exec(pathname);
  if (m?.[1]) return { name: 'design', id: decodeURIComponent(m[1]) };
  return { name: 'notfound' };
}

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
window.addEventListener('popstate', emit);

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  if (to === window.location.pathname) return;
  if (opts.replace) window.history.replaceState(null, '', to);
  else window.history.pushState(null, '', to);
  emit();
}

export const designPath = (id: string) => `/d/${encodeURIComponent(id)}`;

let cachedPath = '';
let cachedRoute: Route = { name: 'home' };

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => {
      if (window.location.pathname !== cachedPath) {
        cachedPath = window.location.pathname;
        cachedRoute = parseRoute(cachedPath);
      }
      return cachedRoute;
    },
  );
}
