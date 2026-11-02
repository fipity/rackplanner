#!/usr/bin/env python3
"""
Build catalog/unifi.json from Ubiquiti's official tech-spec pages.

Input: ~/.cache/rackplanner-research/unifi/<slug>.json, produced by
fetch_unifi.py (extracts the structured spec block that techspecs.ui.com
embeds in each product page). Everything numeric comes from those pages;
anything we had to infer is called out in `notes` and the part is marked
`verified: false` where the core numbers are not on the page.

Run:  python3 scripts/research/build_unifi.py
"""
import json
import math
import os
import re
import sys

R = os.path.expanduser('~/.cache/rackplanner-research')
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'catalog', 'unifi.json')
U = 44.45
ACCENT = '#006fff'


def spec(slug):
    return json.load(open(f'{R}/unifi/{slug}.json'))


def first_num(s):
    m = re.search(r'([\d,]+(?:\.\d+)?)', s or '')
    return float(m.group(1).replace(',', '')) if m else None


def parse_dims(s):
    """First three numbers of a 'a x b x c mm' string."""
    m = re.search(r'([\d.]+)\s*x\s*([\d.]+)\s*x\s*([\d.]+)\s*mm', s or '')
    return tuple(float(x) for x in m.groups()) if m else None


def rack_dims(s, height_u):
    """Return (width, depth) for rack gear; height is the dimension closest to n*U."""
    d = parse_dims(s)
    if not d:
        return None, None
    w, a, b = d
    target = height_u * U
    depth = b if abs(a - target) < abs(b - target) else a
    return w, depth


def weight(s):
    """Prefer 'with mounting brackets' weight; handle grams."""
    if not s:
        return None
    m = re.search(r'With mount(?:ing)? brackets?\s*:?\s*/?\s*([\d.]+)\s*(kg|g)', s, re.I) or re.search(
        r'With (?:mount|rails)\s*:?\s*/?\s*([\d.]+)\s*(kg|g)', s, re.I
    )
    if not m:
        m = re.search(r'([\d.]+)\s*(kg|g)\b', s)
    if not m:
        return None
    v = float(m.group(1))
    return round(v / 1000, 3) if m.group(2).lower() == 'g' else v


def max_power(s):
    """'50W (Excluding PoE Output) / 450W (Including...)' -> 50 (device draw without PoE)."""
    return first_num(s) if s else None


PORT_MAP = {
    '100 MbE RJ45': 'rj45_100m',
    '1 GbE RJ45': 'rj45_1g',
    '2.5 GbE RJ45': 'rj45_2_5g',
    '10 GbE RJ45': 'rj45_10g',
    '1G SFP': 'sfp',
    '10G SFP+': 'sfp_plus',
    '25G SFP28': 'sfp28',
    '100G QSFP28': 'qsfp28',
    'MGMT': 'rj45_1g',
    'Console': 'console',
}


def ports(specs):
    out = {}
    for k, v in specs.items():
        if not k.startswith('Port Layout / '):
            continue
        key = PORT_MAP.get(k.split(' / ', 1)[1])
        n = first_num(v)
        if key and n:
            out[key] = out.get(key, 0) + int(n)
    return out


def bays(specs):
    text = ' / '.join(str(specs.get(k, '')) for k in ('Storage Capacity', 'NVR Storage'))
    out = []
    for n, kind in re.findall(r'\((\d+)\)\s*((?:(?! / ).)*?)(?:drive|HDD|NVMe)\s*bays?', text, re.I):
        size = 'm2' if 'M.2' in kind else '3.5'
        if '2.5' in kind and '3.5' not in kind:
            size = '2.5'
        out.append({'count': int(n), 'size': size})
    if not out:
        m = re.search(r'\((\d+)\)\s*3\.5"\s*NVR HDD bay', text)
        if m:
            out.append({'count': int(m.group(1)), 'size': '3.5'})
    return out or None


def poe_budget(specs):
    for k in ('Total PoE Availability', 'PoE Budget'):
        if k in specs:
            return first_num(specs[k])
    return None


def height_u(specs):
    m = re.search(r'\((\d)U', specs.get('Form Factor', '') or '')
    return int(m.group(1)) if m else None


# ---------------------------------------------------------------------------
# Product selection & overrides
# ---------------------------------------------------------------------------

def P(slug, category, style, **kw):
    return dict(slug=slug, category=category, style=style, **kw)


RACK = [
    # Gateways / consoles
    P('efg', 'gateway', 'gateway', name='Enterprise Fortress Gateway', sub='firewall'),
    P('ef-core', 'gateway', 'gateway', name='Enterprise Firewall Core', sub='firewall'),
    P('udm-beast', 'gateway', 'gateway', sub='cloud-gateway'),
    P('udm-pro-max', 'gateway', 'gateway', sub='cloud-gateway'),
    P('udm-se', 'gateway', 'gateway', sub='cloud-gateway'),
    P('udm-pro', 'gateway', 'gateway', sub='cloud-gateway'),
    P('uxg-enterprise', 'gateway', 'gateway', sub='gateway'),
    P('uxg-pro', 'gateway', 'gateway', sub='gateway', ports={'rj45_1g': 2, 'sfp_plus': 2},
      notes='Ports per UXG-Pro datasheet: (2) GbE RJ45 + (2) 10G SFP+ (WAN/LAN).'),
    P('cloud-key-enterprise', 'gateway', 'server', sub='console', full=True,
      notes='Listed as 1U; 481 mm deep, needs 4-post rails.'),
    # Switches: aggregation & campus
    P('ecs-aggregation', 'switch', 'switch', sub='aggregation', full=True, body='grey'),
    P('usw-pro-xg-aggregation', 'switch', 'switch', sub='aggregation'),
    P('usw-aggregation', 'switch', 'switch', sub='aggregation'),
    P('usw-pro-aggregation', 'switch', 'switch', sub='aggregation'),
    P('ecs-24-poe', 'switch', 'switch', sub='enterprise-campus', full=True, body='grey', poe=1050,
      notes='PoE budget shown for the included 2× 600 W PSUs in shared mode (100–240 V). Up to 2,250 W with optional 1,200 W modules.'),
    P('ecs-48-poe', 'switch', 'switch', sub='enterprise-campus', full=True, body='grey', poe=1750,
      notes='PoE budget: 1,750 W shared mode at 100–120 V (2,150 W at 200–240 V).'),
    P('ecs-48s-poe', 'switch', 'switch', sub='enterprise-campus', full=True, body='grey', poe=1750,
      notes='PoE budget: 1,750 W shared mode at 100–120 V (2,150 W at 200–240 V).'),
    P('ecs-24s-poe', 'switch', 'switch', sub='enterprise-campus', full=True, body='grey', poe=1050,
      notes='PoE budget shown for the included 2× 600 W PSUs in shared mode.'),
    P('ecs-24s', 'switch', 'switch', sub='enterprise-campus', full=True, body='grey'),
    P('ecs-48s', 'switch', 'switch', sub='enterprise-campus', full=True, body='grey'),
    P('ecs-core', 'switch', 'switch', sub='enterprise-campus', full=True, body='grey'),
    P('eav-xg-24-poe', 'switch', 'switch', sub='audio-video', full=True, body='grey', poe=1850,
      notes='PoE budget: 1,850 W shared mode at 100–120 V (2,150 W at 200–240 V).'),
    P('eav-fiber', 'switch', 'switch', sub='audio-video', full=True, body='grey'),
    # Pro XG / Pro Max / Pro HD
    P('usw-pro-xg-48-poe', 'switch', 'switch', sub='pro-xg', poe=972,
      notes='PoE budget 972 W at 100–120 V (1,080 W at 200–240 V).'),
    P('usw-pro-xg-24-poe', 'switch', 'switch', sub='pro-xg'),
    P('usw-pro-xg-10-poe', 'switch', 'switch', sub='pro-xg'),
    P('usw-pro-xg-24', 'switch', 'switch', sub='pro-xg'),
    P('usw-pro-xg-48', 'switch', 'switch', sub='pro-xg'),
    P('usw-pro-max-48', 'switch', 'switch', sub='pro-max'),
    P('usw-pro-max-24', 'switch', 'switch', sub='pro-max'),
    P('usw-pro-max-48-poe', 'switch', 'switch', sub='pro-max'),
    P('usw-pro-max-24-poe', 'switch', 'switch', sub='pro-max'),
    P('usw-pro-hd-24-poe', 'switch', 'switch', sub='pro-hd'),
    P('usw-pro-hd-24', 'switch', 'switch', sub='pro-hd'),
    # Pro / Enterprise / standard
    P('usw-pro-48-poe', 'switch', 'switch', sub='pro'),
    P('usw-pro-24-poe', 'switch', 'switch', sub='pro'),
    P('usw-pro-48', 'switch', 'switch', sub='pro'),
    P('usw-pro-24', 'switch', 'switch', sub='pro'),
    P('usw-enterprise-48-poe', 'switch', 'switch', sub='enterprise', legacy=True),
    P('usw-enterprise-24-poe', 'switch', 'switch', sub='enterprise', legacy=True),
    P('usw-mission-critical', 'switch', 'switch', sub='ups-switch',
      notes='PoE switch with built-in UPS battery and AC outlets.'),
    P('usw-48-poe', 'switch', 'switch', sub='standard'),
    P('usw-48', 'switch', 'switch', sub='standard'),
    P('usw-24-poe', 'switch', 'switch', sub='standard'),
    P('usw-16-poe', 'switch', 'switch', sub='standard'),
    P('usw-24', 'switch', 'switch', sub='standard'),
    P('us-48-750w', 'switch', 'switch', sub='gen1', legacy=True, hu=1),
    P('us-48-500w', 'switch', 'switch', sub='gen1', legacy=True, hu=1),
    P('us-24-500w', 'switch', 'switch', sub='gen1', legacy=True, hu=1),
    P('us-48', 'switch', 'switch', sub='gen1', legacy=True, hu=1),
    P('us-24', 'switch', 'switch', sub='gen1', legacy=True, hu=1),
    P('usw-wan-rj45', 'switch', 'switch', sub='wan'),
    P('usw-wan', 'switch', 'switch', sub='wan'),
    P('usw-lr-switch-8-poe', 'switch', 'switch', sub='long-range', width={'mm': 210}, hu=1,
      notes='Half-width: the included rack kit mounts one or two side by side in 1U.'),
    # Storage / Protect
    P('enas', 'nas', 'nas', sub='unas', full=True, body='grey'),
    P('unas-pro-8', 'nas', 'nas', sub='unas', full=True),
    P('unas-pro', 'nas', 'nas', sub='unas'),
    P('unas-pro-4', 'nas', 'nas', sub='unas', full=True),
    P('uacc-ese-16', 'nas', 'nas', sub='expansion', full=True, body='grey', name='Enterprise Storage Expansion (16-bay)'),
    P('envr-core', 'nvr', 'nas', sub='protect', full=True, body='grey'),
    P('envr', 'nvr', 'nas', sub='protect', full=True, body='grey'),
    P('unvr-pro', 'nvr', 'nas', sub='protect'),
    P('unvr', 'nvr', 'nas', sub='protect'),
    P('unvr-g2-pro', 'nvr', 'nas', sub='protect'),
    P('unvr-g2', 'nvr', 'nas', sub='protect'),
    # Power
    P('usp-rps', 'power', 'pdu', sub='rps', hu=1, ports={'rj45_1g': 1}, maxW=None,
      notes='Power passes through to connected devices, so its own draw is not counted. Six RPS DC outputs for UniFi gateways/switches with RPS input; 600 W @ 52 V + 350 W @ 11.5 V.'),
    P('usp-pdu-pro', 'power', 'pdu', sub='pdu', hu=2, ports={'outlet_nema': 16, 'rj45_1g': 3}, maxW=None,
      notes='Own consumption not published (internal 40 W PSU); outlet load is counted on the connected devices. US model: 16 switchable NEMA 5-15 outlets, 1,875 W max total; 4× USB-C.'),
    P('ups-2u-us', 'power', 'ups', sub='ups', hu=2, ups=(1000, 1440), ports={'outlet_nema': 8},
      notes='US model: 4 battery-backed + 4 surge-only outlets; 216 Wh, ~8 min at 500 W.'),
    P('ups-2u-pro-us', 'power', 'ups', sub='ups', hu=2, full=True, ups=(1920, 1920), ports={'outlet_nema': 8},
      notes='US model: 8 individually switchable outlets, hot-swap 720 Wh battery, ~22 min at 960 W.'),
    P('uacc-eth-sp-panel-24', 'patch-panel', 'patch-panel', sub='surge-protection', hu=1,
      ports={'keystone': 24}, name='Ethernet Surge Protection Panel (24-port)',
      notes='24 protected channels (48 RJ45 jacks, in/out). Up to 10 GbE and PoE+++.'),
]

# Rack-mount kits that turn a desktop device into 1U rack gear: modelled as
# a combined part (device + kit) so it can be dropped straight into a rack.
KITS = [
    dict(id='ubiquiti-usw-pro-max-16-rm', device='usw-pro-max-16', kit='uacc-pro-max-16-rm', name='UniFi Switch Pro Max 16 (with rack kit)', style='switch', category='switch', sub='pro-max'),
    dict(id='ubiquiti-usw-pro-max-16-poe-rm', device='usw-pro-max-16-poe', kit='uacc-pro-max-16-rm', name='UniFi Switch Pro Max 16 PoE (with rack kit)', style='switch', category='switch', sub='pro-max'),
    dict(id='ubiquiti-ucg-industrial-rm', device='ucg-industrial', kit='uacc-ucg-industrial-rm', name='Cloud Gateway Industrial (with rack kit)', style='gateway', category='gateway', sub='cloud-gateway'),
]

DESKTOP = [
    P('ucg-max', 'gateway', 'desktop', sub='cloud-gateway'),
    P('ucg-fiber', 'gateway', 'desktop', sub='cloud-gateway'),
    P('ucg-ultra', 'gateway', 'desktop', sub='cloud-gateway'),
    P('ucg-industrial', 'gateway', 'desktop', sub='cloud-gateway', dims=(307.9, 203.5, 43.7)),
    P('udr7', 'gateway', 'desktop', sub='dream-router', dims=(110, 110, 184.1), notes='Cylindrical; stands upright.'),
    P('udr', 'gateway', 'desktop', sub='dream-router', dims=(110, 110, 184.1), notes='Cylindrical; stands upright.'),
    P('udr-5g-max', 'gateway', 'desktop', sub='dream-router', dims=(110, 110, 250)),
    P('ux7', 'gateway', 'desktop', sub='express'),
    P('uxg-fiber', 'gateway', 'desktop', sub='gateway'),
    P('uxg-max', 'gateway', 'desktop', sub='gateway'),
    P('uxg-lite', 'gateway', 'desktop', sub='gateway'),
    P('uck-g2-plus', 'gateway', 'desktop', sub='console', dims=(131.2, 134.2, 27.1)),
    P('usw-pro-max-16', 'switch', 'desktop', sub='pro-max', dims=(325.1, 160, 43.7)),
    P('usw-pro-max-16-poe', 'switch', 'desktop', sub='pro-max', dims=(325.1, 160, 43.7)),
    P('usw-pro-xg-8-poe', 'switch', 'desktop', sub='pro-xg'),
    P('usw-enterprise-8-poe', 'switch', 'desktop', sub='enterprise', legacy=True),
    P('usw-pro-8-poe', 'switch', 'desktop', sub='pro'),
    P('usw-flex-xg', 'switch', 'desktop', sub='flex'),
    P('usw-lite-16-poe', 'switch', 'desktop', sub='lite'),
    P('usw-lite-8-poe', 'switch', 'desktop', sub='lite', dims=(99.6, 163.7, 31.7)),
    P('usw-flex-2-5g-8-poe', 'switch', 'desktop', sub='flex', poe=196, notes='PoE budget with the 210 W AC adapter (16–76 W when PoE-powered).'),
    P('usw-flex-2-5g-8', 'switch', 'desktop', sub='flex'),
    P('usw-flex-2-5g-5', 'switch', 'desktop', sub='flex'),
    P('usw-flex', 'switch', 'desktop', sub='flex', poe=46, notes='PoE budget with PoE++ / 60 W adapter input.'),
    P('usw-flex-mini', 'switch', 'desktop', sub='flex'),
    P('usw-ultra', 'switch', 'desktop', sub='ultra', poe=42, notes='PoE budget with PoE++ input; up to 202 W with the 210 W adapter.'),
    P('usw-ultra-60w', 'switch', 'desktop', sub='ultra', poe=52, notes='PoE budget with the included 60 W adapter.'),
    P('usw-ultra-210w', 'switch', 'desktop', sub='ultra', poe=202, notes='PoE budget with the included 210 W adapter.'),
    P('us-8-150w', 'switch', 'desktop', sub='gen1', legacy=True, dims=(235, 204, 43)),
    P('us-8-60w', 'switch', 'desktop', sub='gen1', legacy=True),
    P('us-8', 'switch', 'desktop', sub='gen1', legacy=True),
    P('unas-4', 'nas', 'desktop', sub='unas', dims=(129, 224.5, 246), notes='Upright desktop NAS.'),
    P('unas-2', 'nas', 'desktop', sub='unas', dims=(129, 223.7, 135), notes='Upright desktop NAS.'),
    P('unvr-instant', 'nvr', 'desktop', sub='protect'),
    P('ai-key', 'nvr', 'desktop', sub='protect', dims=(131.2, 134.2, 33.7)),
]


def base_part(_slug, s, **kw):
    sp = s['specs']
    return {
        'id': 'ubiquiti-' + _slug,
        'brand': 'Ubiquiti',
        'model': s['name'],
        'name': kw.get('name') or ('UniFi ' + s['title'] if not s['title'].startswith(('UniFi', 'Enterprise')) else s['title']),
        'category': kw['category'],
        **({'subcategory': kw['sub']} if kw.get('sub') else {}),
        'sourceUrl': s['url'],
    }


def finish(p, kw, sp):
    p['power'] = {'typicalW': None, 'maxW': kw.get('maxW', max_power(sp.get('Max. Power Consumption')))}
    pb = kw.get('poe', poe_budget(sp))
    if pb:
        p['poeBudgetW'] = pb
    p['weightKg'] = weight(sp.get('Weight'))
    p['ports'] = kw.get('ports') or ports(sp)
    b = bays(sp)
    if b:
        p['driveBays'] = b
    tags = ['unifi', kw['category']]
    if pb:
        tags.append('poe')
    if kw.get('sub'):
        tags.append(kw['sub'])
    p['tags'] = tags
    if kw.get('legacy'):
        p['legacy'] = True
        p['tags'].append('legacy')
    notes = []
    if 'Excluding PoE' in str(sp.get('Max. Power Consumption', '')):
        notes.append('Max power excludes PoE output.')
    if kw.get('notes'):
        notes.append(kw['notes'])
    if notes:
        p['notes'] = ' '.join(notes)
    return p


def build_rack(kw):
    s = spec(kw['slug'])
    sp = s['specs']
    hu = kw.get('hu') or height_u(sp)
    if not hu:
        raise SystemExit(f'{kw["slug"]}: no U height')
    w, depth = rack_dims(sp.get('Dimensions'), hu)
    p = base_part(kw['slug'], s, **kw)
    p.update({
        'formFactor': 'rack',
        'heightU': hu,
        'width': kw.get('width', '19in'),
        'depthMm': round(depth) if depth else None,
        'mounting': 'full-depth' if kw.get('full') else 'front',
        'rackWidths': ['19in'],
    })
    if kw.get('ups'):
        p['ups'] = {'capacityW': kw['ups'][0], 'capacityVA': kw['ups'][1]}
    p['render'] = {'style': kw['style'], 'body': kw.get('body', 'silver' if kw['style'] in ('switch', 'gateway') else 'black'), 'accent': ACCENT}
    finish(p, kw, sp)
    has_core = p['depthMm'] and p['weightKg'] is not None and (p['power']['maxW'] is not None or kw['category'] in ('patch-panel', 'power'))
    p['verified'] = bool(has_core)
    return p


def build_desktop(kw):
    s = spec(kw['slug'])
    sp = s['specs']
    if kw.get('dims'):
        w, d, h = kw['dims']
    else:
        dims = parse_dims(sp.get('Dimensions'))
        if not dims:
            raise SystemExit(f'{kw["slug"]}: no dims')
        w, d, h = dims  # UniFi desktop specs are W x D x H
    p = base_part(kw['slug'], s, **kw)
    p.update({
        'formFactor': 'desktop',
        'heightU': max(1, math.ceil(h / U - 0.02)),
        'heightMm': h,
        'width': {'mm': round(w, 1)},
        'depthMm': round(d),
        'mounting': 'front',
        'rackWidths': ['19in', '10in'] if w <= 210 else ['19in'],
    })
    p['render'] = {'style': 'desktop', 'body': kw.get('body', 'white'), 'accent': ACCENT}
    finish(p, kw, sp)
    p['tags'].append('needs-shelf')
    p['verified'] = p['weightKg'] is not None
    return p


def build_kit(k):
    dev = spec(k['device'])
    kit = spec(k['kit'])
    sp = dev['specs']
    dims = parse_dims(sp.get('Dimensions'))
    p = {
        'id': k['id'],
        'brand': 'Ubiquiti',
        'model': f"{dev['name']} + {kit['name']}",
        'name': k['name'],
        'category': k['category'],
        'subcategory': k['sub'],
        'formFactor': 'rack',
        'heightU': 1,
        'width': '19in',
        'depthMm': round(sorted(dims)[1]) if dims else None,
        'mounting': 'front',
        'rackWidths': ['19in'],
        'render': {'style': k['style'], 'body': 'silver', 'accent': ACCENT},
        'sourceUrl': dev['url'],
    }
    kw = dict(category=k['category'], sub=k['sub'], notes=f"Requires the {kit['name']} rack-mount kit ({kit['url']}).")
    finish(p, kw, sp)
    dw = weight(sp.get('Weight')) or 0
    kwt = weight(kit['specs'].get('Weight')) or 0
    p['weightKg'] = round(dw + kwt, 2) if dw and kwt else None
    p['verified'] = True
    return p


def accessories():
    ocd = spec('uacc-rack-panel-ocd')
    o = ocd['specs']
    acc = []

    def A(id, model, name, category, style, hu, depth, weight_kg, url, **kw):
        part = {
            'id': id, 'brand': 'Ubiquiti', 'model': model, 'name': name, 'category': category,
            'formFactor': 'rack', 'heightU': hu, 'width': '19in', 'depthMm': depth,
            'mounting': kw.pop('mounting', 'front'), 'rackWidths': ['19in'],
            'power': {'typicalW': None, 'maxW': kw.pop('maxW', None)}, 'weightKg': weight_kg,
            'ports': kw.pop('ports', {}), 'render': {'style': style, 'body': 'black'},
            'tags': ['unifi', 'passive'] + kw.pop('tags', []), 'sourceUrl': url, 'verified': kw.pop('verified', True),
        }
        part.update(kw)
        acc.append(part)

    for variant, style, hu in [('Blank-1U', 'blank', 1), ('Blank-2U', 'blank', 2), ('Vented-1U', 'vented', 1), ('Vented-2U', 'vented', 2), ('Brush-1U', 'brush', 1)]:
        key = f'UACC-Rack-Panel-{variant}'
        kind = variant.split('-')[0]
        A(f'ubiquiti-uacc-rack-panel-{variant.lower()}', key, f'UniFi OCD {kind} Panel {hu}U', 'cable-management' if kind == 'Brush' else 'blank', style, hu,
          64, weight(o[f'{key} / Weight']), ocd['url'], subcategory='ocd-panel')
    pb = spec('uacc-rack-panel-patch-blank-24')
    A('ubiquiti-uacc-rack-panel-patch-blank-24', 'UACC-Rack-Panel-Patch-Blank-24', 'UniFi 24-Port Blank Keystone Patch Panel', 'patch-panel', 'patch-panel', 1,
      64, weight(pb['specs']['Weight']), pb['url'], ports={'keystone': 24}, subcategory='keystone',
      notes='Keystone jacks sold separately. Rear management bar adds ~72 mm depth.')
    s = spec('uacc-rack-shelf-clv')
    A('ubiquiti-uacc-rack-shelf-clv', 'UACC-Rack-Shelf-CLV', 'UniFi Fixed Cantilever Shelf 1U', 'shelf', 'shelf', 1, 250, weight(s['specs']['Weight']), s['url'],
      shelf={'usableWidthMm': 440, 'usableDepthMm': 240}, subcategory='cantilever', tags=['shelf'],
      notes='Max load 20 kg. Usable area estimated from overall size.')
    s = spec('uacc-rack-shelf-sd')
    A('ubiquiti-uacc-rack-shelf-sd', 'UACC-Rack-Shelf-SD', 'UniFi Shallow Depth Rack Shelf 1U', 'shelf', 'shelf', 1, 430, weight(s['specs']['Weight']), s['url'],
      mounting='full-depth', shelf={'usableWidthMm': 440, 'usableDepthMm': 420}, subcategory='4-post', tags=['shelf'],
      notes='4-post shelf for the UniFi 12U cabinet; max load 80 kg. Usable area estimated.')
    s = spec('uacc-rack-shelf-fd')
    A('ubiquiti-uacc-rack-shelf-fd', 'UACC-Rack-Shelf-FD', 'UniFi Full Depth Rack Shelf 1U', 'shelf', 'shelf', 1, 620, weight(s['specs']['Weight']), s['url'],
      mounting='full-depth', shelf={'usableWidthMm': 440, 'usableDepthMm': 610}, subcategory='4-post', tags=['shelf'],
      notes='4-post shelf for the UniFi 42U cabinet; max load 80 kg. Usable area estimated.')
    s = spec('uacc-rack-shelf-tl')
    A('ubiquiti-uacc-rack-shelf-tl', 'UACC-Rack-Shelf-TL', 'UniFi Toolless Mini Rack Shelf (Fixed)', 'shelf', 'shelf', 1, 460, weight(s['specs']['Weight']), s['url'],
      mounting='full-depth', shelf={'usableWidthMm': 440, 'usableDepthMm': 450}, subcategory='mini-rack', tags=['shelf', 'mini-rack'],
      notes='For the UniFi Toolless Mini Rack (U-Rack-6U-TL, a 19" 6U rack). Max load 20 kg.')
    s = spec('uacc-rack-shelf-tl-sd')
    A('ubiquiti-uacc-rack-shelf-tl-sd', 'UACC-Rack-Shelf-TL-SD', 'UniFi Toolless Mini Rack Shelf (Sliding)', 'shelf', 'shelf', 1, 230, weight(s['specs']['Weight']), s['url'],
      shelf={'usableWidthMm': 440, 'usableDepthMm': 220}, subcategory='mini-rack', tags=['shelf', 'mini-rack'],
      notes='For the UniFi Toolless Mini Rack (U-Rack-6U-TL).')
    s = spec('uacc-rack-hcm')
    A('ubiquiti-uacc-rack-hcm', 'UACC-Rack-HCM', 'UniFi Horizontal Cable Management 2U', 'cable-management', 'cable-manager', 2, 64, weight(s['specs']['Weight']), s['url'],
      subcategory='horizontal')
    s = spec('ckg2-rack-mount')
    A('ubiquiti-ckg2-rm', 'CKG2-RM', 'UniFi CloudKey Rack Mount (with CloudKey+)', 'gateway', 'gateway', 1, 47, weight(s['specs']['Weight']), s['url'],
      maxW=12.95, ports={'rj45_1g': 1}, subcategory='console', tags=['console'],
      render={'style': 'gateway', 'body': 'silver', 'accent': ACCENT},
      notes='Holds one CloudKey Gen2 / CloudKey+. Weight is the mount only.')
    s = spec('uacc-ai-port-rm')
    A('ubiquiti-uacc-ai-port-rm', 'UACC-AI-Port-RM', 'UniFi AI Port Rack Mount (up to 6)', 'mount', 'server', 1, 159, weight(s['specs']['Weight']), s['url'],
      subcategory='protect', render={'style': 'server', 'body': 'silver', 'accent': ACCENT}, notes='Holds up to six AI Ports. Weight is the mount only.')
    s = spec('uacc-ai-key-rm')
    A('ubiquiti-uacc-ai-key-rm', 'UACC-AI-Key-RM', 'UniFi AI Key Rack Mount', 'mount', 'server', 1, 56, weight(s['specs']['Weight']), s['url'],
      subcategory='protect', render={'style': 'server', 'body': 'silver', 'accent': ACCENT}, notes='Holds one AI Key. Weight is the mount only.')
    return acc


def main():
    parts = [build_rack(k) for k in RACK] + [build_kit(k) for k in KITS] + [build_desktop(k) for k in DESKTOP] + accessories()
    # us-xg-6poe has no spec block online; keep a minimal unverified desktop entry.
    s = spec('us-xg-6poe')
    parts.append({
        'id': 'ubiquiti-us-xg-6poe', 'brand': 'Ubiquiti', 'model': 'US-XG-6POE', 'name': 'UniFi Switch XG 6 PoE', 'category': 'switch',
        'subcategory': 'gen1', 'formFactor': 'desktop', 'heightU': 1, 'width': {'mm': 210}, 'depthMm': None, 'mounting': 'front',
        'rackWidths': ['19in'], 'power': {'typicalW': None, 'maxW': None}, 'weightKg': None,
        'ports': {'rj45_10g': 4, 'sfp_plus': 2}, 'render': {'style': 'desktop', 'body': 'white', 'accent': ACCENT},
        'tags': ['unifi', 'switch', 'poe', 'legacy', 'needs-shelf'], 'legacy': True, 'sourceUrl': s['url'], 'verified': False,
        'notes': 'Spec page has no dimension/power data; width estimated. Ports from product description.',
    })
    order = {'gateway': 0, 'switch': 1, 'nas': 2, 'nvr': 3, 'power': 4, 'patch-panel': 5, 'cable-management': 6, 'blank': 7, 'shelf': 8, 'mount': 9}
    parts.sort(key=lambda p: (order.get(p['category'], 99), p['formFactor'] != 'rack', p['id']))
    data = {
        '$schema': './schema.json',
        'version': 2,
        'title': 'Ubiquiti UniFi',
        'description': 'Rack-relevant UniFi gateways, switches, storage, Protect and power gear plus rack accessories. '
                       'Specs from techspecs.ui.com (fetched 2026-11-02). Max power excludes PoE output where Ubiquiti lists it that way. '
                       'UniFi publishes max power only, so typicalW is null.',
        'parts': parts,
    }
    with open(OUT, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write('\n')
    unver = [p['id'] for p in parts if not p['verified']]
    print(f'{len(parts)} parts, {len(unver)} unverified: {unver}')


if __name__ == '__main__':
    main()
