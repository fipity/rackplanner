import { resolvePreset, type Part, type StylePreset } from '@rackplanner/shared';

/** Reference device per style preset (README renders, visual tests, gallery). */
export const PRESET_REFERENCE: Record<StylePreset, string[]> = {
  'unifi-silver': ['ubiquiti-usw-pro-max-24-poe', 'ubiquiti-usw-pro-24-poe'],
  'unifi-black': ['ubiquiti-usw-enterprise-24-poe', 'ubiquiti-er-12p'],
  'unifi-white': ['ubiquiti-ucg-ultra'],
  'dell-bezel': ['dell-poweredge-r740'],
  hpe: [],
  synology: ['synology-rs422-plus'],
  mikrotik: [],
  'generic-black': ['generic-switch-8p-10in'],
  'generic-silver': [],
  'patch-panel': ['generic-patch-24-cat6-punch-1u'],
  'brush-panel': ['generic-brush-1u-19'],
  shelf: ['deskpi-rackmate-shelf-1u'],
  pdu: ['generic-pdu-1u-8-c13'],
  ups: ['apc-smt1500rmi2u'],
  'rpi-case': ['raspberry-pi-4-case'],
};

export function referencePart(parts: readonly Part[], preset: StylePreset): Part | undefined {
  for (const id of PRESET_REFERENCE[preset]) {
    const p = parts.find((x) => x.id === id);
    if (p && resolvePreset(p) === preset) return p;
  }
  return parts.find((p) => resolvePreset(p) === preset && p.render.style !== 'shelf') ?? parts.find((p) => resolvePreset(p) === preset);
}
