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
  'usb_c',
  'hdmi',
  'micro_hdmi',
  'displayport',
  'vga',
  'serial',
  'sc_duplex',
  'dc_out',
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
  outlet_au: 'AU/NZ outlet',
  outlet_uk: 'UK outlet',
  usb_c: 'USB-C',
  hdmi: 'HDMI',
  micro_hdmi: 'Micro HDMI',
  displayport: 'DisplayPort',
  vga: 'VGA',
  serial: 'Serial (DB9)',
  sc_duplex: 'SC duplex',
  dc_out: 'DC output',
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

// ---------------------------------------------------------------------------
// Faceplate layouts (declarative front / rear / top drawings)
// ---------------------------------------------------------------------------

/** Visual style presets. Generic, brand-inspired colours only: no logos. */
export const STYLE_PRESETS = [
  'unifi-silver',
  'unifi-black',
  'unifi-white',
  'dell-bezel',
  'hpe',
  'synology',
  'mikrotik',
  'generic-black',
  'generic-silver',
  'patch-panel',
  'brush-panel',
  'shelf',
  'pdu',
  'ups',
  'rpi-case',
] as const;
export const StylePresetSchema = z.enum(STYLE_PRESETS);
export type StylePreset = z.infer<typeof StylePresetSchema>;

/** Connectors that are drawn one per port. */
export const CONNECTORS = [
  'rj45',
  'console',
  'sfp',
  'sfp_plus',
  'sfp28',
  'qsfp',
  'qsfp28',
  'usb_a',
  'usb_c',
  'micro_usb',
  'hdmi',
  'micro_hdmi',
  'vga',
  'displayport',
  'serial',
  'audio',
  'microsd',
  'iec_c13',
  'iec_c14',
  'iec_c19',
  'iec_c20',
  'iec_c6',
  'iec_c8',
  'dc_barrel',
  'outlet_au',
  'outlet_nema',
  'outlet_schuko',
  'outlet_uk',
  'keystone',
  'coupler',
  'punchdown',
  'lc',
  'sc',
] as const;
export const ConnectorSchema = z.enum(CONNECTORS);
export type Connector = z.infer<typeof ConnectorSchema>;

export const PoeLevelSchema = z.enum(['poe', 'poe+', 'poe++', 'poe+++', 'passive']);
export type PoeLevel = z.infer<typeof PoeLevelSchema>;

const frac = z.number().min(0).max(1);
/** Fractional box inside the face. Omitted x flows after the previous region; omitted w uses the natural size. */
const RegionBox = {
  x: frac.optional(),
  w: frac.optional(),
  y: frac.optional(),
  h: frac.optional(),
  align: z.enum(['start', 'center', 'end']).optional(),
};

export const PortRegionSchema = z
  .object({
    type: ConnectorSchema,
    count: z.number().int().positive().max(96).default(1),
    rows: z.number().int().min(1).max(4).optional(),
    /** Ports per visual group (e.g. 12 = blocks of 6 columns × 2 rows). */
    grouping: z.number().int().positive().optional(),
    /** Catalog port type these ports count as (for cables and stats); "none" for pass-through backs. */
    portType: z.union([PortTypeSchema, z.literal('none')]).optional(),
    /** First printed port number; defaults to continuing the face's network numbering. */
    start: z.number().int().nonnegative().optional(),
    /** zigzag = odd ports on top, even below (switch style); row = left to right, row by row. */
    order: z.enum(['zigzag', 'row']).optional(),
    poe: z.union([z.boolean(), PoeLevelSchema]).optional(),
    /** Printed numbers of the PoE ports when only some are powered. */
    poePorts: z.array(z.number().int().positive()).optional(),
    uplink: z.boolean().optional(),
    /** Speed text for tooltips, e.g. "2.5 GbE". */
    speed: z.string().max(24).optional(),
    /** Keystone / port colours, by position (patch panels). */
    colors: z.array(HexColorSchema).optional(),
    /** Print port numbers above the ports. */
    numbers: z.boolean().optional(),
    /** Purpose label shown in tooltips (e.g. "WAN", "Power in"). */
    role: z.string().max(48).optional(),
    ...RegionBox,
  })
  .strict();
export type PortRegion = z.infer<typeof PortRegionSchema>;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const simple = <T extends string, E extends z.ZodRawShape = {}>(type: T, extra?: E) =>
  z.object({ type: z.literal(type), ...RegionBox, ...((extra ?? {}) as E) }).strict();

export const FeatureRegionSchema = z.discriminatedUnion('type', [
  simple('bays', {
    count: z.number().int().positive().max(60),
    size: z.enum(['2.5', '3.5', 'm2', 'e1s']).default('3.5'),
    orientation: z.enum(['horizontal', 'vertical']).optional(),
    rows: z.number().int().min(1).max(6).optional(),
    start: z.number().int().nonnegative().optional(),
  }),
  simple('display', { variant: z.enum(['lcd', 'touch', 'segment']).default('lcd') }),
  simple('vent', { pattern: z.enum(['honeycomb', 'slots', 'mesh', 'holes']).optional() }),
  simple('leds', { count: z.number().int().positive().max(48).default(1), colors: z.array(HexColorSchema).optional(), labels: z.array(z.string().max(8)).optional() }),
  simple('ledbar', { color: HexColorSchema.optional() }),
  simple('button', { kind: z.enum(['power', 'reset', 'pinhole', 'push']).default('push') }),
  simple('label', { text: z.string().max(60).optional(), size: z.number().positive().max(12).optional(), color: HexColorSchema.optional() }),
  simple('psu', { count: z.number().int().positive().max(4).default(1), inlet: z.enum(['iec_c14', 'iec_c20']).default('iec_c14') }),
  simple('fan', { count: z.number().int().positive().max(12).default(1) }),
  simple('pcie', { count: z.number().int().positive().max(8).default(1) }),
  simple('io_shield'),
  simple('ground'),
  simple('label_strip'),
  simple('cable_bar'),
  simple('brush'),
  simple('handle'),
  simple('thumbscrew'),
  simple('switch', { variant: z.enum(['rocker', 'toggle']).default('rocker'), count: z.number().int().positive().max(12).default(1) }),
  simple('breaker'),
  simple('slot'),
  simple('d_ring', { count: z.number().int().positive().max(8).default(3) }),
  simple('panel', { color: HexColorSchema.optional(), radius: z.number().nonnegative().max(40).optional() }),
]);
export type FeatureRegion = z.infer<typeof FeatureRegionSchema>;

export const RegionSchema = z.union([PortRegionSchema, FeatureRegionSchema]);
export type Region = z.infer<typeof RegionSchema>;
export type RegionInput = z.input<typeof RegionSchema>;

export const FaceLayoutSchema = z
  .object({
    style: StylePresetSchema.optional(),
    regions: z.array(RegionSchema).max(64),
  })
  .strict();
export type FaceLayout = z.infer<typeof FaceLayoutSchema>;

export const PartLayoutSchema = z
  .object({
    front: FaceLayoutSchema.optional(),
    rear: FaceLayoutSchema.optional(),
    /** Top-down view (lid), used for shelf plans. */
    top: FaceLayoutSchema.optional(),
    /** True once port positions, displays and rear panel are confirmed against the sources. */
    layoutVerified: z.boolean(),
    sources: z.array(z.url()).default([]),
    notes: z.string().max(2000).optional(),
  })
  .strict();
export type PartLayout = z.infer<typeof PartLayoutSchema>;

export const POWER_CONNECTORS = ['iec_c14', 'iec_c20', 'iec_c8', 'iec_c6', 'ac_inlet', 'usb_c', 'dc_barrel', 'poe', 'hardwired'] as const;
export const PowerInputSchema = z
  .object({
    connector: z.enum(POWER_CONNECTORS),
    /** Device-side input voltage (DC), e.g. 5 for USB-C. */
    voltageV: z.number().positive().max(400).optional(),
    currentA: z.number().positive().max(100).optional(),
    /** How it reaches the wall: no adapter (cord to an outlet), a plug-pack, or an inline brick. */
    adapter: z.enum(['none', 'wall', 'brick']).default('none'),
    adapterW: z.number().positive().max(5000).optional(),
    adapterIncluded: z.boolean().optional(),
    /** Number of power inputs (redundant PSUs). */
    inputs: z.number().int().positive().max(4).default(1),
    notes: z.string().max(400).optional(),
  })
  .strict();
export type PowerInput = z.infer<typeof PowerInputSchema>;

export const RenderSpecSchema = z
  .object({
    style: RenderStyleSchema,
    body: BodyFinishSchema.optional(),
    accent: HexColorSchema.optional(),
    preset: StylePresetSchema.optional(),
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
    layout: PartLayoutSchema.optional(),
    powerInput: PowerInputSchema.optional(),
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
      ctx.addIssue({ code: 'custom', message: 'Typical power cannot exceed max power', path: ['power'] });
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

export const RACK_FRAMES = ['open-2post', 'open-4post', 'cabinet', 'mini-10in', 'rackmate-t1', 'rackmate-t2'] as const;
export const RackFrameSchema = z.enum(RACK_FRAMES);
export type RackFrame = z.infer<typeof RackFrameSchema>;

export const RackSchema = z
  .object({
    width: RackWidthSchema,
    heightU: z.number().int().min(MIN_RACK_U).max(MAX_RACK_U),
    depthMm: z.number().positive().nullable(),
    numbering: z.enum(['bottom-up', 'top-down']).default('bottom-up'),
    /** Frame drawing style. Defaults by width for designs saved before v2. */
    frame: RackFrameSchema.default('open-4post'),
    /** Glass door overlay (cabinets). */
    glassDoor: z.boolean().default(false),
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
    /** Your own measured power draw (W). Overrides catalog typical/max in the stats. */
    measuredW: z.number().nonnegative().max(100000).optional(),
    notes: z.string().max(4000).optional(),
    color: HexColorSchema.optional(),
    /** Per-port colour overrides, keyed "portType:index" (e.g. keystone colours). */
    portColors: z.record(z.string().regex(/^[a-z0-9_]+:[0-9]+$/), HexColorSchema).optional(),
  })
  .strict();
export type PlacedPart = z.infer<typeof PlacedPartSchema>;

export const CABLE_TYPES = ['copper', 'fiber', 'dac', 'power', 'other'] as const;
export const CableTypeSchema = z.enum(CABLE_TYPES);
export type CableType = z.infer<typeof CableTypeSchema>;

export const CableEndSchema = z
  .object({
    placementId: z.string().min(1),
    /** Specific port; omitted for a device-level connection. */
    port: z.object({ type: PortTypeSchema, index: z.number().int().positive() }).strict().optional(),
  })
  .strict();
export type CableEnd = z.infer<typeof CableEndSchema>;

export const CableSchema = z
  .object({
    id: z.string().min(1),
    a: CableEndSchema,
    b: CableEndSchema,
    type: CableTypeSchema.default('copper'),
    color: HexColorSchema,
    label: z.string().max(120).optional(),
    lengthM: z.number().positive().max(1000).optional(),
  })
  .strict();
export type Cable = z.infer<typeof CableSchema>;

export const DESIGN_SCHEMA_VERSION = 2;

/**
 * Upgrade older saved designs to the current shape before validation.
 * v1 → v2: racks gain a frame style (19" → 4-post, 10" → generic mini rack).
 * Unknown input is passed through untouched so zod reports the real error.
 */
export function migrateDesignData(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const d = raw as Record<string, unknown>;
  if (d.schemaVersion === 1) {
    const rack = d.rack && typeof d.rack === 'object' ? (d.rack as Record<string, unknown>) : null;
    return {
      ...d,
      schemaVersion: 2,
      rack: rack
        ? { ...rack, frame: rack.frame ?? (rack.width === '10in' ? 'mini-10in' : 'open-4post'), glassDoor: rack.glassDoor ?? false }
        : d.rack,
    };
  }
  return raw;
}

const DesignObjectSchema = z
  .object({
    schemaVersion: z.literal(DESIGN_SCHEMA_VERSION),
    id: z.string().min(1),
    name: z.string().min(1).max(200),
    rack: RackSchema,
    expectedPoeLoadW: z.number().nonnegative().nullable().default(null),
    placements: z.array(PlacedPartSchema),
    cables: z.array(CableSchema).default([]),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

/** A saved design. Parsing migrates older versions first. */
export const DesignSchema = z.preprocess(migrateDesignData, DesignObjectSchema);
export type Design = z.infer<typeof DesignObjectSchema>;
