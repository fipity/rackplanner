import type { Part, StylePreset } from '../schemas.js';

/**
 * Pick a style preset for a part without one: by render style for passive
 * gear, then by brand (generic brand-inspired colours only), then by finish.
 */
export function resolvePreset(part: Part): StylePreset {
  if (part.render.preset) return part.render.preset;
  switch (part.render.style) {
    case 'patch-panel':
      return 'patch-panel';
    case 'brush':
      return 'brush-panel';
    case 'shelf':
      return 'shelf';
    case 'pdu':
      return 'pdu';
    case 'ups':
      return 'ups';
  }
  const brand = part.brand.toLowerCase();
  const body = part.render.body;
  if (brand.includes('ubiquiti') || brand.includes('unifi')) {
    if (body === 'white') return 'unifi-white';
    if (body === 'black' || body === 'grey') return 'unifi-black';
    return 'unifi-silver';
  }
  if (brand.startsWith('dell')) return 'dell-bezel';
  if (brand.startsWith('hpe') || brand.includes('hewlett')) return 'hpe';
  if (brand.includes('synology')) return 'synology';
  if (brand.includes('mikrotik')) return 'mikrotik';
  return body === 'silver' || body === 'white' ? 'generic-silver' : 'generic-black';
}
