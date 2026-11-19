import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CatalogFileSchema, PartSchema, type Part } from '../schemas.js';
import { withTurnedParts } from '../turn.js';
import {
  detectHeightU,
  detectKind,
  detectQuantity,
  detectRackWidth,
  guessPrinted,
  matchDevices,
  printedPartFromForm,
  slugToTitle,
} from './detect.js';
import { licenceInfo } from './schema.js';
import { makerWorld, normaliseLicence, parseModelUrl, sanitizeText } from './sources.js';

const fixture = (name: string) => readFileSync(path.join(import.meta.dirname, '__fixtures__', name), 'utf8');

const catalogDir = path.join(process.cwd(), 'catalog');
const PARTS: Part[] = withTurnedParts(
  readdirSync(catalogDir)
    .filter((f) => f.endsWith('.json') && f !== 'schema.json')
    .flatMap((f) => CatalogFileSchema.parse(JSON.parse(readFileSync(path.join(catalogDir, f), 'utf8'))).parts),
);
const CATALOG = new Map(PARTS.map((p) => [p.id, p]));

function parsed(url: string) {
  const r = parseModelUrl(url);
  if (!r.ok) throw new Error(r.error);
  return r.parsed;
}

describe('MakerWorld URL parsing', () => {
  const full = 'https://makerworld.com/en/models/2424584-unifi-nvr-instant-10-inch-rackmount#profileId-2659248';
  const canonical = 'https://makerworld.com/en/models/2424584-unifi-nvr-instant-10-inch-rackmount#profileId-2659248';

  it('parses the full form', () => {
    expect(parsed(full)).toEqual({
      site: 'makerworld',
      modelId: '2424584',
      slug: 'unifi-nvr-instant-10-inch-rackmount',
      profileId: '2659248',
      canonicalUrl: canonical,
    });
  });

  it.each([
    ['no language prefix', 'https://makerworld.com/models/2424584-unifi-nvr-instant-10-inch-rackmount#profileId-2659248', canonical],
    ['another language', 'https://makerworld.com/zh/models/2424584-unifi-nvr-instant-10-inch-rackmount#profileId-2659248', canonical],
    ['region language', 'https://makerworld.com/pt-BR/models/2424584-unifi-nvr-instant-10-inch-rackmount#profileId-2659248', canonical],
    ['no profile', 'https://makerworld.com/en/models/2424584-unifi-nvr-instant-10-inch-rackmount', 'https://makerworld.com/en/models/2424584-unifi-nvr-instant-10-inch-rackmount'],
    ['no slug', 'https://makerworld.com/en/models/2424584#profileId-2659248', 'https://makerworld.com/en/models/2424584#profileId-2659248'],
    ['id only', 'https://makerworld.com/models/2424584', 'https://makerworld.com/en/models/2424584'],
    ['www, http, trailing slash', 'http://www.makerworld.com/en/models/2424584-unifi-nvr-instant-10-inch-rackmount/', 'https://makerworld.com/en/models/2424584-unifi-nvr-instant-10-inch-rackmount'],
    ['no scheme', 'makerworld.com/en/models/2424584-unifi-nvr-instant-10-inch-rackmount', 'https://makerworld.com/en/models/2424584-unifi-nvr-instant-10-inch-rackmount'],
    ['tracking query dropped', 'https://makerworld.com/en/models/2424584-unifi?from=search&utm_source=x', 'https://makerworld.com/en/models/2424584-unifi'],
    ['profile in query', 'https://makerworld.com/en/models/2424584?profileId=2659248', 'https://makerworld.com/en/models/2424584#profileId-2659248'],
    ['upper-case slug', 'https://makerworld.com/en/models/2424584-UniFi-NVR', 'https://makerworld.com/en/models/2424584-unifi-nvr'],
    ['whitespace around', '  https://makerworld.com/en/models/2424584  ', 'https://makerworld.com/en/models/2424584'],
  ])('%s', (_name, url, expected) => {
    expect(parsed(url).canonicalUrl).toBe(expected);
    expect(parsed(url).modelId).toBe('2424584');
  });

  it('keeps the profile and slug separately', () => {
    expect(parsed('https://makerworld.com/models/2424584#profileId-2659248')).toMatchObject({ slug: null, profileId: '2659248' });
    expect(parsed('https://makerworld.com/models/2424584-x')).toMatchObject({ slug: 'x', profileId: null });
  });

  it.each([
    ['empty', '', /Paste/],
    ['not a URL', 'hello world', /link/],
    ['other site', 'https://example.com/models/2424584', /Only MakerWorld/],
    ['lookalike host', 'https://makerworld.com.evil.example/en/models/2424584', /Only MakerWorld/],
    ['host in path', 'https://evil.example/makerworld.com/en/models/2424584', /Only MakerWorld/],
    ['userinfo trick', 'https://makerworld.com@evil.example/en/models/2424584', /Only MakerWorld/],
    ['Printables', 'https://www.printables.com/model/12345-rack', /Printables links aren’t supported yet/],
    ['Thingiverse', 'https://www.thingiverse.com/thing:12345', /Thingiverse links aren’t supported yet/],
    ['MakerWorld profile page', 'https://makerworld.com/en/@someone', /isn’t a model page/],
    ['MakerWorld non-numeric id', 'https://makerworld.com/en/models/abc-def', /isn’t a model page/],
    ['MakerWorld subdomain', 'https://shop.makerworld.com/en/models/2424584', /isn’t a model page/],
    ['odd port', 'https://makerworld.com:8443/en/models/2424584', /isn’t a model page/],
    ['javascript scheme', 'javascript:alert(1)', /http/],
    ['ftp', 'ftp://makerworld.com/en/models/2424584', /http/],
  ])('rejects %s', (_name, url, msg) => {
    const r = parseModelUrl(url);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
  });
});

describe('slug to title', () => {
  it.each([
    ['unifi-nvr-instant-10-inch-rackmount', 'UniFi NVR Instant 10 Inch Rackmount'],
    ['raspberry-pi-5-dual-mount-1u', 'Raspberry Pi 5 Dual Mount 1U'],
    ['usw-lite-8-poe-holder', 'USW Lite 8 PoE Holder'],
    ['mikrotik-hex-s--shelf', 'MikroTik Hex S Shelf'],
    ['', ''],
  ])('%s', (slug, title) => expect(slugToTitle(slug)).toBe(title));
  it('handles null', () => expect(slugToTitle(null)).toBe(''));
});

describe('rack width detection', () => {
  it.each([
    ['UniFi NVR Instant 10 inch rackmount', '10in'],
    ['10in rack mount', '10in'],
    ['10" mini rack shelf', '10in'],
    ['10” mini rack shelf', '10in'],
    ['10-inch mount', '10in'],
    ['10 Zoll Rack', '10in'],
    ['19 inch blank panel', '19in'],
    ['19" 1U keystone panel', '19in'],
    ['Mount for 1U rack', null],
    ['RTX 4010 holder', null],
    ['110 inch', null],
  ])('%s → %s', (text, width) => expect(detectRackWidth(text)).toBe(width));
});

describe('U height detection', () => {
  it.each([
    ['UniFi NVR 2U 10 inch', 2],
    ['1U blank', 1],
    ['1.5U shelf', 1.5],
    ['3 U keystone', 3],
    ['2RU faceplate', 2],
    ['10U mini rack', null],
    ['USB hub mount', null],
    ['U7 Pro mount', null],
  ])('%s → %s', (text, u) => expect(detectHeightU(text)).toBe(u));

  it('defaults to 1U and flags it when not found', () => {
    const g = guessPrinted({ title: null, slug: 'unifi-nvr-instant-10-inch-rackmount', description: null }, PARTS);
    expect(g).toMatchObject({ name: 'UniFi NVR Instant 10 Inch Rackmount', heightU: 1, heightFound: false, rackWidth: '10in', kind: 'rackmount' });
  });
});

describe('part type detection', () => {
  it.each([
    ['UniFi NVR Instant rackmount', 'rackmount'],
    ['Raspberry Pi holder', 'rackmount'],
    ['12 port keystone patch panel', 'patch-panel'],
    ['1U blank panel', 'blank'],
    ['Cable management D-ring', 'cable-management'],
    ['Vented shelf 2U', 'shelf'],
    ['Rack ears for TL-SG108', 'bracket'],
    ['Benchy', 'other'],
  ])('%s → %s', (text, kind) => expect(detectKind(text)).toBe(kind));
});

describe('device fuzzy matching', () => {
  it('finds the UniFi NVR Instant first', () => {
    const m = matchDevices('UniFi NVR Instant 10 Inch Rackmount', PARTS);
    expect(m[0]?.part.id).toBe('ubiquiti-unvr-instant');
  });

  it('matches model numbers written either way', () => {
    expect(matchDevices('UNVR-Instant faceplate', PARTS)[0]?.part.id).toBe('ubiquiti-unvr-instant');
    expect(matchDevices('Ubiquiti USW Lite 8 PoE 10" mount', PARTS)[0]?.part.id).toBe('ubiquiti-usw-lite-8-poe');
  });

  it('never suggests panels, shelves, mounts or turned copies', () => {
    for (const m of matchDevices('DeskPi RackMate shelf mount 10 inch', PARTS)) {
      expect(['mount', 'shelf', 'blank', 'patch-panel', 'cable-management']).not.toContain(m.part.category);
      expect(m.part.id).not.toContain('@');
    }
  });

  it('returns nothing for unrelated titles', () => {
    expect(matchDevices('Benchy boat', PARTS)).toEqual([]);
    expect(matchDevices('10 inch rack 1U', PARTS)).toEqual([]);
  });

  it('a brand alone is not a match', () => {
    expect(matchDevices('Ubiquiti', PARTS)).toEqual([]);
  });

  it.each([
    ['2x Raspberry Pi 5 mount', 2],
    ['Dual Raspberry Pi mount', 2],
    ['Quad Pi', 4],
    ['4-bay HDD caddy', 4],
    ['UniFi NVR Instant', 1],
  ])('quantity: %s → %d', (t, q) => expect(detectQuantity(t)).toBe(q));
});

describe('MakerWorld page extraction', () => {
  const url = parsed('https://makerworld.com/en/models/2424584-unifi-nvr-instant-10-inch-rackmount#profileId-2659248');

  it('reads the embedded JSON', () => {
    const d = makerWorld.extract(fixture('makerworld-next-data.html'), url);
    expect(d).toEqual({
      title: 'UniFi NVR Instant 10 inch Rackmount 2U',
      designer: 'Test Designer',
      designerUrl: 'https://makerworld.com/en/@testdesigner',
      thumbnailUrl: 'https://makerworld.bblmw.com/makerworld/model/TEST/design/cover.jpg',
      description: 'A 2U faceplate for the UniFi NVR Instant in a 10" rack. Prints without supports.',
      licence: 'CC BY-NC-SA',
      profileName: '0.2mm layer, PETG, no supports',
    });
  });

  it('falls back to meta tags, taking the designer from "by …"', () => {
    const d = makerWorld.extract(fixture('makerworld-og-only.html'), parsed('https://makerworld.com/en/models/99'));
    expect(d).toMatchObject({
      title: 'Raspberry Pi 5 Dual Mount 1U 10"',
      designer: 'Another Maker',
      thumbnailUrl: 'https://public-cdn.bblmw.com/model/TEST/cover.webp',
      licence: null,
      profileName: null,
    });
    expect(d?.description).toBe('Holds two Raspberry Pi 5 boards & their fans in 1U.');
  });

  it('strips markup and refuses images from other hosts', () => {
    const d = makerWorld.extract(fixture('makerworld-hostile.html'), parsed('https://makerworld.com/en/models/99'));
    expect(d?.title).toBe('Mini PC holder');
    expect(d?.thumbnailUrl).toBeNull();
  });

  it('returns null for a Cloudflare challenge', () => {
    expect(makerWorld.extract(fixture('cloudflare-challenge.html'), url)).toBeNull();
  });

  it('returns null for an empty page', () => {
    expect(makerWorld.extract('<html><body>nothing</body></html>', url)).toBeNull();
  });
});

describe('text and licence helpers', () => {
  it('sanitizes', () => {
    expect(sanitizeText('<b>Hi</b> &amp; <script>x()</script>bye‮')).toBe('Hi & bye');
    expect(sanitizeText('&lt;img src=x onerror=alert(1)&gt;ok')).toBe('ok');
    expect(sanitizeText('x'.repeat(300), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(sanitizeText(42)).toBeNull();
  });

  it('normalises and reads licences', () => {
    expect(normaliseLicence('BY-NC-SA')).toBe('CC BY-NC-SA');
    expect(normaliseLicence('cc by-nd 4.0')).toBe('CC BY-ND 4.0');
    expect(normaliseLicence('Standard Digital File License')).toBe('Standard Digital File License');
    expect(licenceInfo('CC BY-NC-SA')).toMatchObject({ nonCommercial: true, noDerivatives: false, shareAlike: true });
    expect(licenceInfo('CC BY-ND 4.0')).toMatchObject({ nonCommercial: false, noDerivatives: true });
    expect(licenceInfo('CC BY')).toMatchObject({ nonCommercial: false, noDerivatives: false });
    expect(licenceInfo(null)).toBeNull();
  });
});

describe('form to part', () => {
  it('builds a valid custom part that holds the device', () => {
    const src = parsed('https://makerworld.com/en/models/2424584-unifi-nvr-instant-10-inch-rackmount#profileId-2659248');
    const input = printedPartFromForm(
      {
        name: 'UniFi NVR Instant 10" mount',
        kind: 'rackmount',
        heightU: 2,
        rackWidth: '10in',
        depthMm: null,
        mounting: 'front',
        filament: '#1c1c1c',
        status: 'planned',
        notes: '',
        holds: [{ partId: 'ubiquiti-unvr-instant', qty: 1 }],
        source: { site: 'makerworld', modelId: src.modelId, profileId: src.profileId, url: src.canonicalUrl, title: null, designer: null, designerUrl: null, licence: null, profileName: null, description: null, fetchedAt: null },
        thumbnail: null,
      },
      CATALOG,
    );
    const part = PartSchema.parse({ ...input, id: 'custom-nvr-mount-abc123' });
    expect(part.tags).toContain('3d-printed');
    expect(part.category).toBe('mount');
    expect(part.shelf).toEqual({ usableWidthMm: 222, usableDepthMm: 220 });
    expect(part.depthMm).toBe(220);
    expect(part.printed?.source.url).toBe('https://makerworld.com/en/models/2424584-unifi-nvr-instant-10-inch-rackmount#profileId-2659248');
  });

  it('rejects a printed part not tagged 3d-printed', () => {
    const r = PartSchema.safeParse({
      id: 'custom-x-abc',
      brand: 'x',
      model: 'x',
      name: 'x',
      category: 'blank',
      heightU: 1,
      width: '10in',
      depthMm: null,
      mounting: 'front',
      rackWidths: ['10in'],
      power: { typicalW: null, maxW: null },
      weightKg: null,
      render: { style: 'blank' },
      sourceUrl: null,
      verified: false,
      printed: { kind: 'blank', source: { site: 'makerworld', modelId: '1', profileId: null, url: 'https://makerworld.com/en/models/1' } },
    });
    expect(r.success).toBe(false);
  });
});
