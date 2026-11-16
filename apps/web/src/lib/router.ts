/** Minimal history-API router: "/" (home), "/d/:id" (editor), "/s/:token" (read-only share). */
import { useSyncExternalStore } from 'react';

export type Route = { name: 'home' } | { name: 'gallery' } | { name: 'design'; id: string } | { name: 'print'; id: string } | { name: 'shared'; token: string } | { name: 'notfound' };

export function parseRoute(pathname: string): Route {
  if (pathname === '/' || pathname === '') return { name: 'home' };
  if (pathname === '/_faceplates') return { name: 'gallery' };
  const m = /^\/d\/([^/]+)\/?$/.exec(pathname);
  if (m?.[1]) return { name: 'design', id: decodeURIComponent(m[1]) };
  const pm = /^\/d\/([^/]+)\/print\/?$/.exec(pathname);
  if (pm?.[1]) return { name: 'print', id: decodeURIComponent(pm[1]) };
  const sm = /^\/s\/([A-Za-z0-9_-]+)\/?$/.exec(pathname);
  if (sm?.[1]) return { name: 'shared', token: sm[1] };
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

/** Absolute URL of a read-only share link. */
export const shareUrl = (token: string) => `${window.location.origin}/s/${token}`;

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
