import { z } from 'zod';
import { MAX_RACK_U, MIN_RACK_U } from './units.js';

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const RackWidthSchema = z.enum(['19in', '10in']);

export const MountingSchema = z.enum(['front', 'rear', 'full-depth']);
export type Mounting = z.infer<typeof MountingSchema>;

/** `desktop` parts are not rack-mountable and must sit on a shelf part. */
export const FormFactorSchema = z.enum(['rack', 'desktop']);
export type FormFactor = z.infer<typeof FormFactorSchema>;

export const PORT_TYPES = [
  'rj45_100m',
  'rj45_1g',
  'rj45_2_5g',
  'rj45_5g',
  'rj45_10g',
  'sfp',
  'sfp_plus',
  'sfp28',
  'qsfp_plus',
  'qsfp28',
  'keystone',
  'lc_duplex',
  'usb',
  'console',
  'outlet_c13',
  'outlet_c19',
  'outlet_nema',
  'outlet_schuko',
  'outlet_au',
  'outlet_uk',
] as const;
export const PortTypeSchema = z.enum(PORT_TYPES);
export type PortType = z.infer<typeof PortTypeSchema>;

export const PORT_TYPE_LABELS: Record<PortType, string> = {
  rj45_100m: 'RJ45 100M',
  rj45_1g: 'RJ45 1G',
  rj45_2_5g: 'RJ45 2.5G',
  rj45_5g: 'RJ45 5G',
  rj45_10g: 'RJ45 10G',
  sfp: 'SFP 1G',
  sfp_plus: 'SFP+ 10G',
  sfp28: 'SFP28 25G',
  qsfp_plus: 'QSFP+ 40G',
  qsfp28: 'QSFP28 100G',
  keystone: 'Keystone',
  lc_duplex: 'LC duplex',
  usb: 'USB',
  console: 'Console',
  outlet_c13: 'C13 outlet',
  outlet_c19: 'C19 outlet',
  outlet_nema: 'NEMA outlet',
  outlet_schuko: 'Schuko outlet',
  outlet_au: 'AU outlet',
  outlet_uk: 'UK outlet',
};

export const RenderStyleSchema = z.enum([
  'switch',
  'gateway',
  'server',
  'nas',
  'patch-panel',
  'blank',
  'vented',
  'brush',
  'shelf',
  'ups',
  'pdu',
  'cable-manager',
  'drawer',
  'fan',
  'desktop',
]);
export type RenderStyle = z.infer<typeof RenderStyleSchema>;

export const BodyFinishSchema = z.enum(['black', 'silver', 'white', 'grey']);
export type BodyFinish = z.infer<typeof BodyFinishSchema>;

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #rrggbb colour');

// ---------------------------------------------------------------------------
// Part
// ---------------------------------------------------------------------------

export const WidthClassSchema = z.union([
  z.enum(['19in', '10in', 'half-19in']),
  z.object({ mm: z.number().positive().max(450) }).strict(),
]);
export type WidthClass = z.infer<typeof WidthClassSchema>;

const nullableNonNeg = z.number().nonnegative().nullable();

export const PortsSchema = z.partialRecord(PortTypeSchema, z.number().int().nonnegative());
export type Ports = z.infer<typeof PortsSchema>;

export const DriveBaySchema = z
  .object({
    count: z.number().int().positive(),
    size: z.enum(['2.5', '3.5', 'm2', 'e1s', 'u2']),
  })
  .strict();

export const ShelfSpecSchema = z
  .object({
    usableWidthMm: z.number().positive(),
    usableDepthMm: z.number().positive(),
  })
  .strict();

export const UpsSpecSchema = z
  .object({
    capacityW: z.number().positive(),
    capacityVA: z.number().positive().nullable(),
  })
  .strict();

export const RenderSpecSchema = z
  .object({
    style: RenderStyleSchema,
    body: BodyFinishSchema.optional(),
    accent: HexColorSchema.optional(),
  })
  .strict();

/** Half-U precision for heights (0.5U patch panels exist). */
const heightU = z
  .number()
  .min(0.5)
  .max(MAX_RACK_U)
  .refine((v) => Number.isInteger(v * 2), 'heightU must be a multiple of 0.5');

export const PartSchema = z
  .object({
    id: z
      .string()
      .min(3)
      .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'id must be lowercase kebab-case'),
    source: z.enum(['seed', 'custom']).default('seed'),
    brand: z.string().min(1),
    model: z.string().min(1),
    name: z.string().min(1),
    category: z.string().min(1),
    subcategory: z.string().min(1).optional(),
    formFactor: FormFactorSchema.default('rack'),
    /** Rack units occupied. For desktop parts: footprint in U when sat on a shelf. */
    heightU,
    /** Physical height for desktop parts (informational). */
    heightMm: z.number().positive().optional(),
    width: WidthClassSchema,
    depthMm: nullableNonNeg,
    mounting: MountingSchema,
    rackWidths: z.array(RackWidthSchema).min(1),
    power: z
      .object({ typicalW: nullableNonNeg, maxW: nullableNonNeg })
      .strict(),
    poeBudgetW: nullableNonNeg.optional(),
    weightKg: nullableNonNeg,
    ports: PortsSchema.default({}),
    driveBays: z.array(DriveBaySchema).optional(),
    shelf: ShelfSpecSchema.optional(),
    ups: UpsSpecSchema.optional(),
    render: RenderSpecSchema,
    tags: z.array(z.string().min(1)).default([]),
    legacy: z.boolean().optional(),
    sourceUrl: z.url().nullable(),
    verified: z.boolean(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.formFactor === 'desktop' && p.shelf) {
      ctx.addIssue({ code: 'custom', message: 'desktop parts cannot be shelves', path: ['shelf'] });
    }
    if (p.width === '19in' && !p.rackWidths.includes('19in')) {
      ctx.addIssue({ code: 'custom', message: '19in-wide parts must list 19in in rackWidths', path: ['rackWidths'] });
    }
    if (p.power.typicalW !== null && p.power.maxW !== null && p.power.typicalW > p.power.maxW) {
      ctx.addIssue({ code: 'custom', message: 'typicalW cannot exceed maxW', path: ['power'] });
    }
  });

export type Part = z.infer<typeof PartSchema>;
export type PartInput = z.input<typeof PartSchema>;

export const CatalogFileSchema = z
  .object({
    $schema: z.string().optional(),
    /** Bump whenever the file's content changes so the DB re-seeds it. */
    version: z.number().int().positive(),
    title: z.string().min(1),
    description: z.string().optional(),
    parts: z.array(PartSchema),
  })
  .strict();
export type CatalogFile = z.infer<typeof CatalogFileSchema>;

// ---------------------------------------------------------------------------
// Design
// ---------------------------------------------------------------------------

export const RackSchema = z
  .object({
    width: RackWidthSchema,
    heightU: z.number().int().min(MIN_RACK_U).max(MAX_RACK_U),
    depthMm: z.number().positive().nullable(),
    numbering: z.enum(['bottom-up', 'top-down']).default('bottom-up'),
  })
  .strict();
export type Rack = z.infer<typeof RackSchema>;

export const PlacedPartSchema = z
  .object({
    id: z.string().min(1),
    partId: z.string().min(1),
    /** Lowest U occupied, 1-based. Half-U precision. */
    bottomU: z.number().min(1).refine((v) => Number.isInteger(v * 2), 'bottomU must be a multiple of 0.5'),
    /** Offset from the left rail in the front view, in mm. */
    xMm: z.number().nonnegative(),
    mounting: MountingSchema,
    /** Set when this part sits on a shelf placement. */
    parentId: z.string().min(1).optional(),
    label: z.string().max(120).optional(),
    notes: z.string().max(4000).optional(),
    color: HexColorSchema.optional(),
  })
  .strict();
export type PlacedPart = z.infer<typeof PlacedPartSchema>;

export const DesignSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    name: z.string().min(1).max(200),
    rack: RackSchema,
    expectedPoeLoadW: z.number().nonnegative().nullable().default(null),
    placements: z.array(PlacedPartSchema),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type Design = z.infer<typeof DesignSchema>;
