import type { Connector, PoeLevel, PortType } from '../schemas.js';

/**
 * Nominal connector sizes in millimetres (opening plus its bezel), and how
 * they pack. Taken from typical connector datasheets; close enough that a
 * 24-port switch or a Raspberry Pi end looks right at real scale.
 */
export interface ConnectorSpec {
  w: number;
  h: number;
  gapX: number;
  gapY: number;
  /** Extra gap between visual groups. */
  groupGap: number;
  /** Default columns per group. */
  groupCols: number;
  /** Numbering family: ports in the same family continue each other's numbers. */
  family: 'net' | 'patch' | 'usb' | 'video' | 'power' | 'outlet' | 'other';
  label: string;
}

const net = (w: number, h: number, groupCols: number, label: string): ConnectorSpec => ({
  w,
  h,
  gapX: 1.3,
  gapY: 1.4,
  groupGap: 4,
  groupCols,
  family: 'net',
  label,
});

export const CONNECTOR_SPECS: Record<Connector, ConnectorSpec> = {
  rj45: net(13.6, 11.6, 6, 'Port'),
  console: { ...net(13.6, 11.6, 1, 'Console'), family: 'other' },
  sfp: net(14.2, 9.8, 2, 'Port'),
  sfp_plus: net(14.2, 9.8, 2, 'Port'),
  sfp28: net(14.2, 9.8, 2, 'Port'),
  qsfp: net(19.6, 10.4, 2, 'Port'),
  qsfp28: net(19.6, 10.4, 2, 'Port'),
  usb_a: { w: 13.2, h: 5.8, gapX: 2, gapY: 1.6, groupGap: 3, groupCols: 4, family: 'usb', label: 'USB' },
  usb_c: { w: 9.2, h: 3.6, gapX: 2.5, gapY: 2, groupGap: 3, groupCols: 4, family: 'usb', label: 'USB-C' },
  micro_usb: { w: 8, h: 3.2, gapX: 2.5, gapY: 2, groupGap: 3, groupCols: 4, family: 'usb', label: 'Micro USB' },
  hdmi: { w: 15.2, h: 6, gapX: 2.5, gapY: 2, groupGap: 3, groupCols: 4, family: 'video', label: 'HDMI' },
  micro_hdmi: { w: 7, h: 3.2, gapX: 6.5, gapY: 2, groupGap: 3, groupCols: 4, family: 'video', label: 'Micro HDMI' },
  vga: { w: 31, h: 12.5, gapX: 3, gapY: 2, groupGap: 3, groupCols: 4, family: 'video', label: 'VGA' },
  displayport: { w: 16.1, h: 6.4, gapX: 2.5, gapY: 2, groupGap: 3, groupCols: 4, family: 'video', label: 'DisplayPort' },
  serial: { w: 31, h: 12.5, gapX: 3, gapY: 2, groupGap: 3, groupCols: 4, family: 'other', label: 'Serial' },
  audio: { w: 6.2, h: 6.2, gapX: 3, gapY: 2, groupGap: 3, groupCols: 4, family: 'other', label: 'Audio' },
  microsd: { w: 12, h: 2, gapX: 3, gapY: 2, groupGap: 3, groupCols: 4, family: 'other', label: 'microSD' },
  iec_c13: { w: 24, h: 15.5, gapX: 4, gapY: 3, groupGap: 6, groupCols: 4, family: 'outlet', label: 'C13 outlet' },
  iec_c19: { w: 26, h: 19.5, gapX: 4, gapY: 3, groupGap: 6, groupCols: 4, family: 'outlet', label: 'C19 outlet' },
  iec_c14: { w: 27, h: 19.5, gapX: 4, gapY: 3, groupGap: 6, groupCols: 4, family: 'power', label: 'C14 inlet' },
  iec_c20: { w: 29, h: 23, gapX: 4, gapY: 3, groupGap: 6, groupCols: 4, family: 'power', label: 'C20 inlet' },
  iec_c6: { w: 14, h: 9, gapX: 4, gapY: 3, groupGap: 6, groupCols: 4, family: 'power', label: 'C6 inlet' },
  iec_c8: { w: 12, h: 7, gapX: 4, gapY: 3, groupGap: 6, groupCols: 4, family: 'power', label: 'C8 inlet' },
  dc_barrel: { w: 8.5, h: 8.5, gapX: 4, gapY: 3, groupGap: 4, groupCols: 8, family: 'power', label: 'DC jack' },
  outlet_au: { w: 30, h: 30, gapX: 5, gapY: 3, groupGap: 6, groupCols: 99, family: 'outlet', label: 'AU/NZ outlet' },
  outlet_nema: { w: 28, h: 32, gapX: 5, gapY: 3, groupGap: 6, groupCols: 99, family: 'outlet', label: 'NEMA outlet' },
  outlet_schuko: { w: 36, h: 36, gapX: 5, gapY: 3, groupGap: 6, groupCols: 99, family: 'outlet', label: 'Schuko outlet' },
  outlet_uk: { w: 32, h: 36, gapX: 5, gapY: 3, groupGap: 6, groupCols: 99, family: 'outlet', label: 'UK outlet' },
  keystone: { w: 14.8, h: 16.6, gapX: 1.4, gapY: 2, groupGap: 4.5, groupCols: 6, family: 'patch', label: 'Port' },
  coupler: { w: 14.8, h: 16.6, gapX: 1.4, gapY: 2, groupGap: 4.5, groupCols: 6, family: 'patch', label: 'Port' },
  punchdown: { w: 14.8, h: 20, gapX: 1.4, gapY: 2, groupGap: 4.5, groupCols: 6, family: 'patch', label: 'Port' },
  lc: { w: 13.2, h: 10, gapX: 1.6, gapY: 2, groupGap: 4, groupCols: 6, family: 'patch', label: 'LC' },
  sc: { w: 13.2, h: 10, gapX: 1.6, gapY: 2, groupGap: 4, groupCols: 6, family: 'patch', label: 'SC' },
};

/** Catalog port type a connector counts as when the region doesn't say. */
export const DEFAULT_PORT_TYPE: Partial<Record<Connector, PortType>> = {
  rj45: 'rj45_1g',
  console: 'console',
  sfp: 'sfp',
  sfp_plus: 'sfp_plus',
  sfp28: 'sfp28',
  qsfp: 'qsfp_plus',
  qsfp28: 'qsfp28',
  usb_a: 'usb',
  usb_c: 'usb_c',
  hdmi: 'hdmi',
  micro_hdmi: 'micro_hdmi',
  vga: 'vga',
  displayport: 'displayport',
  serial: 'serial',
  iec_c13: 'outlet_c13',
  iec_c19: 'outlet_c19',
  outlet_au: 'outlet_au',
  outlet_nema: 'outlet_nema',
  outlet_schuko: 'outlet_schuko',
  outlet_uk: 'outlet_uk',
  keystone: 'keystone',
  coupler: 'keystone',
  lc: 'lc_duplex',
  sc: 'sc_duplex',
};

/** Connector drawn for a catalog port type (used by auto-generated layouts). */
export const CONNECTOR_FOR_PORT: Record<PortType, Connector> = {
  rj45_100m: 'rj45',
  rj45_1g: 'rj45',
  rj45_2_5g: 'rj45',
  rj45_5g: 'rj45',
  rj45_10g: 'rj45',
  sfp: 'sfp',
  sfp_plus: 'sfp_plus',
  sfp28: 'sfp28',
  qsfp_plus: 'qsfp',
  qsfp28: 'qsfp28',
  keystone: 'keystone',
  lc_duplex: 'lc',
  usb: 'usb_a',
  console: 'console',
  outlet_c13: 'iec_c13',
  outlet_c19: 'iec_c19',
  outlet_nema: 'outlet_nema',
  outlet_schuko: 'outlet_schuko',
  outlet_au: 'outlet_au',
  outlet_uk: 'outlet_uk',
  usb_c: 'usb_c',
  hdmi: 'hdmi',
  micro_hdmi: 'micro_hdmi',
  displayport: 'displayport',
  vga: 'vga',
  serial: 'serial',
  sc_duplex: 'sc',
  dc_out: 'dc_barrel',
};

/** Short speed / kind text for tooltips. */
export const PORT_SPEED_TEXT: Record<PortType, string> = {
  rj45_100m: '100 Mb',
  rj45_1g: '1 GbE',
  rj45_2_5g: '2.5 GbE',
  rj45_5g: '5 GbE',
  rj45_10g: '10 GbE',
  sfp: '1G SFP',
  sfp_plus: '10G SFP+',
  sfp28: '25G SFP28',
  qsfp_plus: '40G QSFP+',
  qsfp28: '100G QSFP28',
  keystone: 'Keystone',
  lc_duplex: 'LC duplex',
  usb: 'USB-A',
  console: 'Console',
  outlet_c13: 'C13',
  outlet_c19: 'C19',
  outlet_nema: 'NEMA',
  outlet_schuko: 'Schuko',
  outlet_au: 'AU/NZ 10 A',
  outlet_uk: 'UK',
  usb_c: 'USB-C',
  hdmi: 'HDMI',
  micro_hdmi: 'Micro HDMI',
  displayport: 'DisplayPort',
  vga: 'VGA',
  serial: 'DB9',
  sc_duplex: 'SC duplex',
  dc_out: 'DC',
};

export const POE_TEXT: Record<PoeLevel, string> = {
  poe: 'PoE',
  'poe+': 'PoE+',
  'poe++': 'PoE++',
  'poe+++': 'PoE+++',
  passive: 'Passive PoE',
};

/** Tier order used to spot uplinks: the fastest copper tier on a mixed device. */
export const RJ45_TIERS: readonly PortType[] = ['rj45_100m', 'rj45_1g', 'rj45_2_5g', 'rj45_5g', 'rj45_10g'];
