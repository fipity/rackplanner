/**
 * Thumbnails of 3D-printed parts, kept in the data volume so they show
 * offline. Every image is decoded (never trusted by extension or MIME type),
 * shrunk to at most 600 px and re-encoded as WebP without metadata. The file
 * name is the SHA-256 of the stored bytes.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ThumbnailIdSchema } from '@rackplanner/shared';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const THUMB_MAX_PX = 600;
const FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif']);

export class ImageError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
  }
}

type SharpFn = typeof import('sharp');
let sharpPromise: Promise<SharpFn | null> | null = null;

/** sharp is a native module: load it lazily so the server still starts without it. */
function loadSharp(): Promise<SharpFn | null> {
  sharpPromise ??= import('sharp').then(
    (m) => (m.default ?? m) as SharpFn,
    () => null,
  );
  return sharpPromise;
}

export class ThumbnailStore {
  constructor(private readonly dir: string) {}

  pathOf(id: string): string | null {
    if (!ThumbnailIdSchema.safeParse(id).success) return null;
    const file = path.join(this.dir, `${id}.webp`);
    return existsSync(file) ? file : null;
  }

  read(id: string): Buffer | null {
    const file = this.pathOf(id);
    return file ? readFileSync(file) : null;
  }

  /** Decode, validate, resize and store an image. Returns its id. */
  async store(input: Buffer): Promise<string> {
    if (input.length === 0) throw new ImageError('Empty image');
    if (input.length > MAX_IMAGE_BYTES) throw new ImageError(`Image larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB`, 413);
    const sharp = await loadSharp();
    if (!sharp) throw new ImageError('Image processing is not available on this server', 503);
    let out: Buffer;
    try {
      const img = sharp(input, { failOn: 'error', limitInputPixels: 40_000_000, animated: false });
      const meta = await img.metadata();
      if (!meta.format || !FORMATS.has(meta.format) || !meta.width || !meta.height) throw new ImageError('Not a supported image (JPEG, PNG, WebP, GIF or AVIF)');
      out = await img
        .rotate()
        .resize({ width: THUMB_MAX_PX, height: THUMB_MAX_PX, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
    } catch (e) {
      if (e instanceof ImageError) throw e;
      throw new ImageError('Not a valid image');
    }
    const id = createHash('sha256').update(out).digest('hex');
    const file = path.join(this.dir, `${id}.webp`);
    if (!existsSync(file)) {
      mkdirSync(this.dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, out);
      renameSync(tmp, file);
    }
    return id;
  }
}
