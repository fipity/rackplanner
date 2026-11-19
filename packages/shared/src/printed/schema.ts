/**
 * 3D-printed parts (rack mounts, shelves, blanks…) made from a model on a
 * sharing site such as MakerWorld. A printed part is an ordinary custom
 * catalog part with a `printed` block describing where it comes from.
 */
import { z } from 'zod';

/** Sites a model link can come from. Only MakerWorld has an adapter so far. */
export const SOURCE_SITES = ['makerworld'] as const;
export const SourceSiteSchema = z.enum(SOURCE_SITES);
export type SourceSite = z.infer<typeof SourceSiteSchema>;

export const PRINT_STATUSES = ['planned', 'printing', 'printed', 'installed'] as const;
export const PrintStatusSchema = z.enum(PRINT_STATUSES);
export type PrintStatus = z.infer<typeof PrintStatusSchema>;
export const PRINT_STATUS_LABELS: Record<PrintStatus, string> = {
  planned: 'Planned',
  printing: 'Printing',
  printed: 'Printed',
  installed: 'Installed',
};
/** Statuses that still need printing. */
export const TO_PRINT: ReadonlySet<PrintStatus> = new Set(['planned', 'printing']);

export const PRINTED_KINDS = ['rackmount', 'shelf', 'blank', 'cable-management', 'patch-panel', 'bracket', 'other'] as const;
export const PrintedKindSchema = z.enum(PRINTED_KINDS);
export type PrintedKind = z.infer<typeof PrintedKindSchema>;
export const PRINTED_KIND_LABELS: Record<PrintedKind, string> = {
  rackmount: 'Rackmount (holds a device)',
  shelf: 'Shelf',
  blank: 'Blank panel',
  'cable-management': 'Cable management',
  'patch-panel': 'Patch panel / keystone',
  bracket: 'Ear / bracket',
  other: 'Other',
};

export const DEFAULT_FILAMENT = '#1c1c1c';

const Hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #rrggbb colour');
const NumericId = z.string().regex(/^[0-9]{1,15}$/, 'expected a numeric id');
/** Thumbnails are stored by the SHA-256 of their (re-encoded) bytes. */
export const ThumbnailIdSchema = z.string().regex(/^[a-f0-9]{64}$/, 'expected a thumbnail id');

export const PrintedSourceSchema = z
  .object({
    site: SourceSiteSchema,
    modelId: NumericId,
    profileId: NumericId.nullable(),
    /** Canonical model page URL. */
    url: z.url(),
    /** Title as published on the site. */
    title: z.string().max(200).nullable().default(null),
    designer: z.string().max(120).nullable().default(null),
    designerUrl: z.url().nullable().default(null),
    /** Licence as stated by the site, e.g. "CC BY-NC-SA 4.0". */
    licence: z.string().max(120).nullable().default(null),
    /** Print profile name (when the link named a profile). */
    profileName: z.string().max(200).nullable().default(null),
    /** Short plain-text summary of the description. */
    description: z.string().max(1000).nullable().default(null),
    /** When details were last read from the site; null when filled in by hand. */
    fetchedAt: z.iso.datetime().nullable().default(null),
  })
  .strict();
export type PrintedSource = z.infer<typeof PrintedSourceSchema>;

export const HeldDeviceSchema = z
  .object({
    partId: z.string().min(1),
    qty: z.number().int().min(1).max(12).default(1),
  })
  .strict();
export type HeldDevice = z.infer<typeof HeldDeviceSchema>;

export const PrintedSpecSchema = z
  .object({
    kind: PrintedKindSchema,
    source: PrintedSourceSchema,
    /** Devices the mount is made for; added inside it when it's placed. */
    holds: z.array(HeldDeviceSchema).max(8).default([]),
    /** Default filament colour. */
    filament: Hex.default(DEFAULT_FILAMENT),
    /** Default print status for new placements. */
    status: PrintStatusSchema.default('planned'),
    /** Cached thumbnail (served from the data volume), if any. */
    thumbnail: ThumbnailIdSchema.nullable().default(null),
  })
  .strict();
export type PrintedSpec = z.infer<typeof PrintedSpecSchema>;

/** Per-placement overrides for a printed part. */
export const PlacedPrintSchema = z
  .object({
    status: PrintStatusSchema.optional(),
    filament: Hex.optional(),
  })
  .strict();
export type PlacedPrint = z.infer<typeof PlacedPrintSchema>;

export interface LicenceInfo {
  text: string;
  nonCommercial: boolean;
  noDerivatives: boolean;
  shareAlike: boolean;
}

/** Read the restrictions out of a licence string (Creative Commons style). */
export function licenceInfo(licence: string | null | undefined): LicenceInfo | null {
  if (!licence?.trim()) return null;
  const text = licence.trim();
  const up = text.toUpperCase();
  const cc = /\bBY\b|CREATIVE COMMONS|\bCC\b/.test(up);
  return {
    text,
    nonCommercial: (cc && /\bNC\b/.test(up)) || /NON-?COMMERCIAL/.test(up),
    noDerivatives: (cc && /\bND\b/.test(up)) || /NO-?DERIV/.test(up),
    shareAlike: (cc && /\bSA\b/.test(up)) || /SHARE-?ALIKE/.test(up),
  };
}
