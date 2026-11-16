import { Check, Copy, Link2, Share2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createShareApi, deleteShareApi, getShareApi, type ShareInfo } from '../lib/api';
import { shareUrl } from '../lib/router';
import { toast } from '../lib/toast';
import { useDesignStore } from '../store/designStore';
import { Button, cx, inputClass } from './ui';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function Dialog({ designId, onClose }: { designId: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [share, setShare] = useState<ShareInfo | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => {
    getShareApi(designId).then(setShare, (e) => {
      toast(e instanceof Error ? e.message : 'Could not load sharing', 'error');
      setShare(null);
    });
  }, [designId]);

  const act = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Something went wrong', 'error');
    } finally {
      setBusy(false);
    }
  };
  const url = share ? shareUrl(share.token) : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast('Copy failed: select the link and copy it', 'error');
    }
  };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby="share-title"
      className="m-auto w-[min(30rem,calc(100vw-2rem))] rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
    >
      <div className="space-y-3 p-5 text-sm">
        <h2 id="share-title" className="text-lg font-semibold">
          Share a read-only link
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Anyone with the link can view this design (both views, stats and parts list) and download it as PDF or JSON. They can't change it, and they don't need your
          login. The link always shows the latest saved version.
        </p>
        {LOCAL_HOSTS.has(window.location.hostname) && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            You're using RackPlanner at {window.location.hostname}, so the link only works on this computer. Run the server on your network (or behind a reverse
            proxy) to share it with others.
          </p>
        )}
        {share === undefined ? (
          <p className="text-zinc-500">Loading…</p>
        ) : share ? (
          <div className="flex gap-2">
            <input readOnly aria-label="Share link" className={cx(inputClass, 'flex-1 font-mono text-xs')} value={url} onFocus={(e) => e.target.select()} />
            <Button className="border border-zinc-300 dark:border-zinc-700" onClick={() => void copy()}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />} {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        ) : (
          <p className="text-zinc-500">Sharing is off.</p>
        )}
      </div>
      <div className="flex justify-between gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-800">
        {share ? (
          <Button variant="danger" disabled={busy} onClick={act(async () => (await deleteShareApi(designId), setShare(null), toast('Sharing turned off')))}>
            Stop sharing
          </Button>
        ) : (
          <Button variant="primary" disabled={busy || share === undefined} onClick={act(async () => setShare(await createShareApi(designId)))}>
            <Link2 className="size-4" /> Create link
          </Button>
        )}
        <Button onClick={onClose} autoFocus>
          Done
        </Button>
      </div>
    </dialog>
  );
}

export function ShareButton() {
  const [open, setOpen] = useState(false);
  const designId = useDesignStore((s) => s.design.id);
  return (
    <>
      <Button aria-label="Share" title="Share a read-only link" onClick={() => setOpen(true)}>
        <Share2 className="size-4" />
        <span className="max-sm:hidden">Share</span>
      </Button>
      {open && <Dialog designId={designId} onClose={() => setOpen(false)} />}
    </>
  );
}
