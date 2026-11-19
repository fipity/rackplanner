/**
 * Guessing rack details from a printed model's title, slug and description,
 * and turning the confirmed form into a catalog part.
 */
import { partWidthMm, type Catalog } from '../placement.js';
import type { Mounting, Part, PartInput } from '../schemas.js';
import { RACK_OPENING_MM, U_MM } from '../units.js';
import type { HeldDevice, PrintedKind, PrintedSource, PrintStatus } from './schema.js';

// ---------------------------------------------------------------------------
// Slug → title
// ---------------------------------------------------------------------------

/** Words with fixed capitalisation (brands, acronyms). Keys are lower case. */
const CASING: Record<string, string> = {
  unifi: 'UniFi',
  ubiquiti: 'Ubiquiti',
  mikrotik: 'MikroTik',
  tplink: 'TP-Link',
  omada: 'Omada',
  synology: 'Synology',
  qnap: 'QNAP',
  nvr: 'NVR',
  unvr: 'UNVR',
  udm: 'UDM',
  udr: 'UDR',
  ucg: 'UCG',
  uxg: 'UXG',
  usw: 'USW',
  usp: 'USP',
  ups: 'UPS',
  pdu: 'PDU',
  poe: 'PoE',
  nas: 'NAS',
  nuc: 'NUC',
  ssd: 'SSD',
  hdd: 'HDD',
  usb: 'USB',
  hdmi: 'HDMI',
  sfp: 'SFP',
  rj45: 'RJ45',
  ont: 'ONT',
  nbn: 'nbn',
  pc: 'PC',
  pcs: 'PCs',
  mini: 'Mini',
  rpi: 'RPi',
  pi: 'Pi',
  cm4: 'CM4',
  cm5: 'CM5',
  sbc: 'SBC',
  diy: 'DIY',
  hp: 'HP',
  ip: 'IP',
  wifi: 'WiFi',
  deskpi: 'DeskPi',
  rackmate: 'RackMate',
  macmini: 'Mac Mini',
  ac: 'AC',
  dc: 'DC',
  id: 'ID',
  tv: 'TV',
  ii: 'II',
  iii: 'III',
};

/** "unifi-nvr-instant-10-inch-rackmount" → "UniFi NVR Instant 10 Inch Rackmount". */
export function slugToTitle(slug: string | null | undefined): string {
  if (!slug) return '';
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => {
      const lower = w.toLowerCase();
      if (CASING[lower]) return CASING[lower];
      if (/^\d+(?:\.\d+)?u$/i.test(w)) return w.toUpperCase(); // 1u → 1U
      if (/^\d/.test(w)) return lower; // 10, 2x, 3d
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// Rack width / U height / kind
// ---------------------------------------------------------------------------

export type RackWidthGuess = '10in' | '19in';

/** "10 inch", "10in", "10"", "10-inch", "10’’", "10 zoll" → 10in (same for 19). */
export function detectRackWidth(text: string): RackWidthGuess | null {
  const t = text.replace(/[“”″]/g, '"').replace(/[‘’′]{2}|''/g, '"');
  const re = /(?:^|[^0-9.])(10|19)\s*(?:-\s*)?(?:inch(?:es)?\b|in\b|"|zoll\b|”)/gi;
  const found = new Set<string>();
  for (const m of t.matchAll(re)) found.add(m[1]!);
  if (found.size === 1) return found.has('10') ? '10in' : '19in';
  if (found.size > 1) {
    // "19 inch to 10 inch adapter": the first mentioned wins.
    const first = re.exec(t);
    re.lastIndex = 0;
    return first?.[1] === '19' ? '19in' : '10in';
  }
  return null;
}

/** U height from "1U", "2 U", "1.5U", "2RU" ("10U" mini racks are ignored above 8U). Null if none. */
export function detectHeightU(text: string): number | null {
  const re = /(?:^|[^0-9a-z.])(\d{1,2}(?:\.5)?)\s*-?\s*R?U\b/gi;
  for (const m of text.matchAll(re)) {
    const u = Number(m[1]);
    if (u >= 0.5 && u <= 8 && Number.isInteger(u * 2)) return u;
  }
  return null;
}

const KIND_RULES: [PrintedKind, RegExp][] = [
  ['patch-panel', /patch\s*panel|keystone/i],
  ['cable-management', /cable\s*(?:management|manager|guide|comb|organi[sz]er)|d-?ring|brush\s*panel|pass[\s-]*through/i],
  ['blank', /\bblank(?:ing)?\b|filler\s*panel|cover\s*plate|blank\s*plate/i],
  ['rackmount', /rack\s*-?\s*mount|\bmount\b|holder|bracket\s*for|faceplate\s*for|enclosure|\bcase\b|\bcradle\b/i],
  ['shelf', /\bshelf\b|\btray\b|\bshelves\b/i],
  ['bracket', /\bears?\b|\bbracket|adapter|\brail/i],
];

export function detectKind(text: string): PrintedKind {
  for (const [kind, re] of KIND_RULES) if (re.test(text)) return kind;
  return 'other';
}

// ---------------------------------------------------------------------------
// Fuzzy device matching
// ---------------------------------------------------------------------------

/** Words that say nothing about which device a mount is for. */
const STOP = new Set(
  'a an and the for with to of in on by my v2 v3 new rack racks rackmount mount mounts mounted mounting holder bracket brackets inch inches in zoll u ru 10in 19in shelf tray case faceplate panel front ear ears adapter printable print printed 3d model version remix kit simple easy minimal modular'.split(
    ' ',
  ),
);
const ALIASES: Record<string, string> = { ubiquiti: 'unifi', ubnt: 'unifi', raspberrypi: 'raspberry', rpi: 'raspberry pi', rasp: 'raspberry' };
/** Brand words count, but less than model words. */
const BRAND_WORDS = new Set(['unifi', 'mikrotik', 'synology', 'qnap', 'tp', 'link', 'netgear', 'cisco', 'dell', 'hp', 'lenovo', 'intel', 'apple', 'raspberry', 'deskpi', 'apc', 'nokia', 'arris', 'eaton', 'cyberpower', 'zyxel', 'asus', 'beelink', 'minisforum', 'geeekpi']);

export function tokens(text: string): string[] {
  const out: string[] = [];
  const cleaned = text
    .toLowerCase()
    .replace(/(?:^|\s)(10|19)\s*(?:-\s*)?(?:inch(?:es)?|in|"|”|zoll)(?=\s|$|[^a-z])/g, ' ')
    .replace(/\b\d{1,2}(?:\.5)?\s*-?\s*r?u\b/g, ' ')
    .replace(/\b\d+\s*[x×]\s*/g, ' ');
  for (const raw of cleaned.split(/[^a-z0-9.+]+/)) {
    const w = raw.replace(/^\.+|\.+$/g, '');
    if (!w || STOP.has(w)) continue;
    for (const a of (ALIASES[w] ?? w).split(' ')) out.push(a);
  }
  return out;
}

export interface DeviceMatch {
  part: Part;
  score: number;
}

/** Parts a printed mount could hold: real devices, not panels or other mounts. */
export function canBeHeld(part: Part): boolean {
  return (
    part.formFactor !== 'wall' &&
    !part.id.includes('@') &&
    !part.printed &&
    !['mount', 'shelf', 'blank', 'cable-management', 'patch-panel', 'wall-outlet', 'accessory'].includes(part.category)
  );
}

function partTokens(part: Part): { all: Set<string>; model: Set<string>; joined: string } {
  const model = new Set(tokens(part.model.replace(/-/g, ' ')));
  const all = new Set([...tokens(`${part.brand} ${part.name}`), ...model]);
  // "UNVR-Instant" also matches a title that writes it "unvrinstant".
  return { all, model, joined: part.model.toLowerCase().replace(/[^a-z0-9]/g, '') };
}

/**
 * Catalog parts whose name or model best matches `text` (a model title),
 * best first. Score is a weighted Dice coefficient over meaningful words:
 * brand words count half, words from the model number one and a half.
 */
export function matchDevices(text: string, parts: Iterable<Part>, limit = 5, minScore = 0.35): DeviceMatch[] {
  const q = new Set(tokens(text));
  if (!q.size) return [];
  const results: DeviceMatch[] = [];
  for (const part of parts) {
    if (!canBeHeld(part)) continue;
    const { all, model, joined } = partTokens(part);
    const weight = (w: string) => (BRAND_WORDS.has(w) ? 0.5 : model.has(w) || w === joined ? 1.5 : 1);
    let shared = 0;
    let distinctive = 0;
    let qw = 0;
    for (const w of q) {
      const hit = all.has(w) || (w === joined && joined.length > 3);
      qw += hit ? weight(w) : 1;
      if (!hit) continue;
      shared += weight(w);
      if (!BRAND_WORDS.has(w)) distinctive++;
    }
    if (!distinctive) continue;
    let pw = 0;
    for (const w of all) pw += weight(w);
    const score = (2 * shared) / (qw + pw);
    if (score >= minScore) results.push({ part, score: Math.round(score * 1000) / 1000 });
  }
  return results.sort((a, b) => b.score - a.score || a.part.name.length - b.part.name.length).slice(0, limit);
}

/** "2x Raspberry Pi", "dual", "twin", "quad" → how many devices the mount holds. */
export function detectQuantity(text: string): number {
  const m = /(?:^|[^0-9])([2-8])\s*[x×]\s*[a-z]/i.exec(text) ?? /\b([2-8])\s*-?\s*(?:bay|slot)s?\b/i.exec(text);
  if (m) return Number(m[1]);
  if (/\b(?:dual|twin|double)\b/i.test(text)) return 2;
  if (/\btriple\b/i.test(text)) return 3;
  if (/\bquad\b/i.test(text)) return 4;
  return 1;
}

export interface PrintedGuess {
  name: string;
  kind: PrintedKind;
  rackWidth: RackWidthGuess | null;
  heightU: number;
  /** False when the U height wasn't in the text (defaulted to 1U: check it). */
  heightFound: boolean;
  matches: DeviceMatch[];
  quantity: number;
}

/** Everything we can guess from a model's title, slug and description. */
export function guessPrinted(input: { title: string | null; slug: string | null; description: string | null }, parts: Iterable<Part>): PrintedGuess {
  const title = input.title?.trim() || slugToTitle(input.slug) || 'Printed part';
  const text = [title, slugToTitle(input.slug)].join(' · ');
  const full = `${text} · ${input.description ?? ''}`;
  const u = detectHeightU(text) ?? detectHeightU(full);
  const matches = matchDevices(title, parts);
  return {
    name: title,
    kind: detectKind(text),
    rackWidth: detectRackWidth(text) ?? detectRackWidth(full),
    heightU: u ?? 1,
    heightFound: u !== null,
    matches,
    quantity: detectQuantity(title),
  };
}

// ---------------------------------------------------------------------------
// Form → part
// ---------------------------------------------------------------------------

export interface PrintedPartForm {
  name: string;
  kind: PrintedKind;
  heightU: number;
  rackWidth: RackWidthGuess;
  depthMm: number | null;
  mounting: Extract<Mounting, 'front' | 'rear'>;
  filament: string;
  status: PrintStatus;
  notes: string;
  holds: HeldDevice[];
  source: PrintedSource;
  thumbnail: string | null;
}

const KIND_CATEGORY: Record<PrintedKind, string> = {
  rackmount: 'mount',
  shelf: 'shelf',
  blank: 'blank',
  'cable-management': 'cable-management',
  'patch-panel': 'patch-panel',
  bracket: 'mount',
  other: 'accessory',
};

/** Clearance either side of a held device, mm. */
const HOLD_GAP = 2;

/** Room inside a mount for the devices it holds (width side by side, deepest depth). */
export function holdsEnvelope(holds: readonly HeldDevice[], catalog: Catalog): { widthMm: number; depthMm: number | null; heightMm: number | null } {
  let w = 0;
  let d: number | null = null;
  let h: number | null = null;
  for (const hd of holds) {
    const part = catalog.get(hd.partId);
    if (!part) continue;
    w += (partWidthMm(part) + HOLD_GAP) * hd.qty;
    if (part.depthMm !== null) d = Math.max(d ?? 0, part.depthMm);
    const ph = part.heightMm ?? part.heightU * U_MM;
    h = Math.max(h ?? 0, ph);
  }
  return { widthMm: w, depthMm: d, heightMm: h };
}

/** Build the custom part for a confirmed printed-part form (the server assigns the id). */
export function printedPartFromForm(form: PrintedPartForm, catalog: Catalog): PartInput {
  const opening = RACK_OPENING_MM[form.rackWidth];
  const holds = form.kind === 'rackmount' || form.kind === 'shelf' ? form.holds.filter((h) => catalog.has(h.partId)) : [];
  const env = holdsEnvelope(holds, catalog);
  const carrier = form.kind === 'rackmount' || form.kind === 'shelf';
  const depth = form.depthMm ?? env.depthMm;
  const style = carrier ? 'shelf' : form.kind === 'cable-management' ? 'cable-manager' : form.kind === 'patch-panel' ? 'patch-panel' : 'blank';
  const designer = form.source.designer?.trim();
  const part: PartInput = {
    id: 'custom-pending',
    source: 'custom',
    brand: designer ? `${designer} (3D printed)` : '3D printed',
    model: form.source.title?.trim() || form.name,
    name: form.name.trim() || 'Printed part',
    category: KIND_CATEGORY[form.kind],
    subcategory: form.kind === 'rackmount' ? 'device-mount' : form.kind === 'bracket' ? 'bracket' : undefined,
    formFactor: 'rack',
    heightU: form.heightU,
    width: form.rackWidth,
    depthMm: depth ?? null,
    mounting: form.mounting,
    rackWidths: [form.rackWidth],
    power: { typicalW: null, maxW: null },
    weightKg: null,
    ports: {},
    render: { style, body: 'black', preset: 'generic-black' },
    tags: ['3d-printed', form.source.site, form.kind],
    sourceUrl: form.source.url,
    verified: false,
    notes: form.notes.trim() || undefined,
    printed: {
      kind: form.kind,
      source: form.source,
      holds,
      filament: form.filament,
      status: form.status,
      thumbnail: form.thumbnail,
    },
  };
  if (carrier) {
    part.shelf = {
      usableWidthMm: Math.round(Math.min(opening, env.widthMm > 0 ? env.widthMm : opening - 10)),
      usableDepthMm: Math.max(1, Math.round(depth ?? env.depthMm ?? 150)),
    };
  }
  if (part.subcategory === undefined) delete part.subcategory;
  if (part.notes === undefined) delete part.notes;
  return part;
}
