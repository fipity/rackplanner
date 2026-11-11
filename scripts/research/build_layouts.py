#!/usr/bin/env python3
"""Add detailed faceplate layouts to popular catalog entries (idempotent).

UniFi rack gear: port counts, PoE classes, display, drive bays and power inputs
come from the techspecs.ui.com data cached by fetch_unifi.py
(~/.cache/rackplanner-research/unifi/<slug>.json). Positions follow each
family's front-panel convention (display left, ports, SFP cages, drive bays
right; power, RPS input and fans on the rear) and are marked
layoutVerified: false, since the spec sheet doesn't give positions.

Dell, Synology and APC layouts use the port lists in the vendors' technical
guides / spec pages (sources recorded per layout).

Usage: python3 scripts/research/build_layouts.py
"""
import json, os, re

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
CAT = os.path.join(ROOT, 'catalog')
CACHE = os.path.expanduser('~/.cache/rackplanner-research/unifi')


def load(f):
    return json.load(open(os.path.join(CAT, f)))


def save(f, d, changed):
    if changed:
        d['version'] += 1
        open(os.path.join(CAT, f), 'w').write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
    print(f'{f}: {changed} layouts updated')


SPEED = {
    '100 MbE RJ45': ('rj45', 'rj45_100m'),
    '1 GbE RJ45': ('rj45', 'rj45_1g'),
    '2.5 GbE RJ45': ('rj45', 'rj45_2_5g'),
    '10 GbE RJ45': ('rj45', 'rj45_10g'),
    '1G SFP': ('sfp', 'sfp'),
    '10G SFP+': ('sfp_plus', 'sfp_plus'),
    '25G SFP28': ('sfp28', 'sfp28'),
    '100G QSFP28': ('qsfp28', 'qsfp28'),
}
POE = {'PoE': 'poe', 'PoE+': 'poe+', 'PoE++': 'poe++', 'PoE+++': 'poe+++'}


def poe_groups(text, count):
    """'24 (16 PoE+; 8 PoE++)' -> [(16,'poe+'), (8,'poe++')]; '(All PoE+)' -> [(count,'poe+')]."""
    m = re.search(r'\(([^)]*)\)', text)
    if not m:
        return [(count, None)]
    inner = m.group(1)
    a = re.match(r'All (PoE\+*)', inner)
    if a:
        return [(count, POE[a.group(1)])]
    groups = [(int(n), POE[lvl]) for n, lvl in re.findall(r'(\d+) (PoE\+*)', inner)]
    used = sum(n for n, _ in groups)
    if used < count:
        groups.append((count - used, None))
    return groups


def cache_specs(part):
    slug = (part.get('sourceUrl') or '').rstrip('/').split('/')[-1]
    f = os.path.join(CACHE, f'{slug}.json')
    return json.load(open(f))['specs'] if slug and os.path.exists(f) else None


def unifi_ports(sp, gateway):
    """Front port regions from the spec's port layout, in UniFi panel order."""
    layout = {k.split('/ ', 1)[1]: v for k, v in sp.items() if k.startswith('Port Layout / ')}
    regions, counts = [], {}
    order = ['100 MbE RJ45', '1 GbE RJ45', '2.5 GbE RJ45', '10 GbE RJ45', '1G SFP', '10G SFP+', '25G SFP28', '100G QSFP28']
    rj_tiers = [k for k in order if k in layout and 'RJ45' in k]
    wan = sp.get('Default WAN Ports', '')
    for key in order:
        if key not in layout:
            continue
        n = int(re.match(r'\d+', layout[key]).group())
        conn, ptype = SPEED[key]
        counts[ptype] = counts.get(ptype, 0) + n
        cage = conn != 'rj45'
        groups = poe_groups(layout[key], n)
        # Gateways: a lone WAN RJ45 on the end of the only copper tier (e.g. UDM-Pro's port 9).
        split_wan = gateway and conn == 'rj45' and len(rj_tiers) == 1 and n % 2 == 1 and 'RJ45' in wan and n > 1
        for gi, (gn, lvl) in enumerate(groups):
            if split_wan and gi == len(groups) - 1:
                if gn > 1:
                    regions.append({'type': conn, 'count': gn - 1, 'portType': ptype, **({'poe': lvl} if lvl else {})})
                regions.append({'type': conn, 'count': 1, 'portType': ptype, 'uplink': True, 'role': 'WAN'})
                continue
            r = {'type': conn, 'count': gn, 'portType': ptype}
            # UniFi stacks copper ports in pairs (odd on top), sub-groups included.
            if conn == 'rj45' and n >= 8 and gn % 2 == 0 and gn >= 4:
                r['rows'] = 2
            if lvl:
                r['poe'] = lvl
            if cage:
                r['uplink'] = True
            if gateway and conn == 'rj45' and gn == 1 and len(rj_tiers) > 1 and key == rj_tiers[-1]:
                r.update({'uplink': True, 'role': 'WAN'})
            if conn == 'rj45' and gn >= 6:
                r['grouping'] = 12 if gn >= 12 else gn
            regions.append(r)
    for extra, role in (('MGMT', 'MGMT'), ('Console', 'Console')):
        if extra in layout:
            n = int(re.match(r'\d+', layout[extra]).group())
            if extra == 'MGMT':
                counts['rj45_1g'] = counts.get('rj45_1g', 0) + n
                regions.append({'type': 'rj45', 'count': n, 'portType': 'rj45_1g', 'role': role, 'start': 0})
            else:
                counts['console'] = counts.get('console', 0) + n
                regions.append({'type': 'console', 'count': n, 'portType': 'console', 'role': role})
    return regions, counts


def unifi_power(sp, part):
    pm = sp.get('Power Method', '')
    regions, inputs = [], 1
    m = re.search(r'\((\d)\) (?:Universal|AC) (?:AC )?input', pm)
    if m and int(m.group(1)) >= 2 or 'Hot-swappable power modules' in pm:
        inputs = 2
        regions.append({'type': 'psu', 'count': 2, 'x': 0.66, 'w': 0.31})
    elif 'Adapter' in pm:
        regions.append({'type': 'dc_barrel', 'count': 1, 'role': 'Power in (adapter)', 'x': 0.88})
    else:
        regions.append({'type': 'iec_c14', 'count': 1, 'role': 'AC in', 'x': 0.86})
    if 'RPS' in pm:
        regions.insert(0, {'type': 'dc_barrel', 'count': 1, 'role': 'USP-RPS DC input', 'x': 0.76})
    if 'Adapter' in pm:
        pi = {'connector': 'dc_barrel', 'adapter': 'brick', 'adapterIncluded': 'included' in pm.lower() or True}
    else:
        pi = {'connector': 'iec_c14', 'adapter': 'none', 'inputs': inputs}
        if 'RPS' in pm:
            pi['notes'] = 'Also takes DC backup power from a UniFi USP-RPS.'
    return regions, pi


def bay_count(text):
    m = re.search(r'\((\d+)\)', text or '')
    return int(m.group(1)) if m else 0


def unifi_layout(part, sp):
    style = part['render']['style']
    preset = 'unifi-white' if part['render'].get('body') == 'white' else 'unifi-black' if part['render'].get('body') in ('black', 'grey') else 'unifi-silver'
    lcm = sp.get('LCM Display') or (sp.get('Display') if 'touch' in (sp.get('Display') or '') else None)
    front, rear = [], []
    src = part['sourceUrl']
    notes = 'Port counts, PoE classes, display and power inputs from the spec page; positions follow the UniFi family layout (display left, ports, SFP cages right; power and fans on the rear) and are not confirmed.'
    if style in ('switch', 'gateway'):
        gateway = style == 'gateway'
        ports, counts = unifi_ports(sp, gateway)
        if not ports:
            return None
        want = {k: v for k, v in part['ports'].items() if v}
        if counts != want:
            print(f'  skip {part["id"]}: spec ports {counts} != catalog {want}')
            return None
        if lcm:
            front.append({'type': 'display', 'variant': 'touch' if 'touch' in lcm else 'lcd', 'x': 0.025, 'w': 0.055, 'y': 0.2, 'h': 0.6})
        else:
            front.append({'type': 'leds', 'count': 1, 'x': 0.03, 'y': 0.45, 'h': 0.1})
        front.append({'type': 'label', 'text': part['model'], 'x': 0.025 if not lcm else 0.09, 'y': 0.08, 'size': 2.6})
        bays = bay_count(sp.get('NVR Storage'))
        start_x = 0.13
        ports[0] = {**ports[0], 'x': start_x}
        if bays:
            # Leave room for the HDD bay(s) on the right.
            front += ports
            front.append({'type': 'bays', 'count': bays, 'size': '3.5', 'x': 0.79, 'w': 0.19, 'rows': 1 if bays == 1 else 2})
        else:
            front += ports
        front.append({'type': 'ledbar', 'x': 0.0, 'w': 1.0, 'y': 0.955, 'h': 0.03})
        pr, pi = unifi_power(sp, part)
        maxw = part['power'].get('maxW') or 0
        fans = 0 if maxw < 60 else 2 if maxw < 400 else 3
        rear = [{'type': 'ground', 'x': 0.03}]
        if fans:
            rear.append({'type': 'fan', 'count': fans, 'x': 0.25, 'w': 0.3 if fans == 2 else 0.4})
        else:
            rear.append({'type': 'vent', 'pattern': 'holes', 'x': 0.15, 'w': 0.5})
        rear += pr
        return {'front': {'style': preset, 'regions': front}, 'rear': {'style': preset, 'regions': rear}}, pi, notes
    if style == 'nas':
        bays = bay_count(sp.get('Hard Drive Capacity') or sp.get('NVR Storage') or sp.get('Storage Capacity'))
        if not bays:
            return None
        if lcm:
            front.append({'type': 'display', 'variant': 'touch', 'x': 0.025, 'w': 0.06, 'y': 0.15 if part['heightU'] == 1 else 0.3, 'h': 0.6 if part['heightU'] == 1 else 0.3})
        else:
            front.append({'type': 'leds', 'count': 2, 'x': 0.03, 'y': 0.4, 'h': 0.15})
        front.append({'type': 'button', 'kind': 'power', 'x': 0.035, 'y': 0.8 if part['heightU'] > 1 else 0.82, 'h': 0.12 if part['heightU'] > 1 else 0.14})
        rows = 4 if bays >= 16 else 2 if part['heightU'] >= 2 else 1
        front.append({'type': 'bays', 'count': bays, 'size': '3.5', 'x': 0.11, 'w': 0.86, 'rows': rows})
        net, counts = [], {}
        for t in ['rj45_1g', 'rj45_2_5g', 'rj45_10g', 'sfp_plus', 'sfp28']:
            n = part['ports'].get(t)
            if n:
                conn = 'rj45' if t.startswith('rj45') else t
                net.append({'type': conn, 'count': n, 'portType': t, **({'uplink': True} if conn != 'rj45' else {})})
        if net:
            net[0] = {**net[0], 'x': 0.25}
        pr, pi = unifi_power(sp, part)
        rear = [{'type': 'fan', 'count': 2 if part['heightU'] < 3 else 3, 'x': 0.02, 'w': 0.2 if part['heightU'] < 3 else 0.3}]
        if part['heightU'] >= 3:
            net = [{**r, 'x': 0.36} if i == 0 else r for i, r in enumerate(net)]
        rear += net + pr
        return {'front': {'style': preset, 'regions': front}, 'rear': {'style': preset, 'regions': rear}}, pi, notes
    if style == 'patch-panel':
        n = part['ports'].get('keystone', 0)
        if not n:
            return None
        return ({'front': {'style': 'patch-panel', 'regions': [
            {'type': 'keystone', 'count': n, 'numbers': True, 'grouping': 6, 'x': 0.03, 'w': 0.94, 'y': 0.06, 'h': 0.7},
            {'type': 'label_strip', 'x': 0.05, 'w': 0.9, 'y': 0.8, 'h': 0.12}]},
            'rear': {'style': 'patch-panel', 'regions': [
                {'type': 'coupler', 'count': n, 'portType': 'none', 'numbers': True, 'grouping': 6, 'x': 0.03, 'w': 0.94}]}},
            None, 'Keystone count from the spec page; positions estimated.')
    return None


HANDMADE = {'ubiquiti-ucg-ultra', 'ubiquiti-usw-lite-8-poe', 'ubiquiti-unvr-instant'}


def desktop_power(sp):
    pm = (sp.get('Power Method') or '') + ' ' + (sp.get('Power Supply') or '')
    if re.search(r'usb[ -]?(type[ -]?)?c', pm, re.I):
        return {'type': 'usb_c', 'count': 1, 'portType': 'none', 'role': 'Power in'}, {'connector': 'usb_c', 'adapter': 'wall', 'adapterIncluded': 'included' in pm}
    if 'Internal' in pm or 'internal' in pm or 'Universal' in pm:
        return {'type': 'iec_c8', 'count': 1, 'role': 'AC in'}, {'connector': 'ac_inlet', 'adapter': 'none'}
    if 'Adapter' in pm or 'DC' in pm:
        return {'type': 'dc_barrel', 'count': 1, 'role': 'DC in'}, {'connector': 'dc_barrel', 'adapter': 'brick', 'adapterIncluded': 'included' in pm}
    if 'PoE' in pm:
        return None, {'connector': 'poe', 'adapter': 'none', 'notes': 'Powered by PoE on its uplink port.'}
    return None, None


def unifi_desktop(part, sp):
    cat = part['category']
    gateway = cat == 'gateway'
    ports, counts = unifi_ports(sp, gateway)
    want = {k: v for k, v in part['ports'].items() if v}
    if not ports or counts != want:
        if ports:
            print(f'  skip {part["id"]}: spec ports {counts} != catalog {want}')
        return None
    preset = 'unifi-white' if part['render'].get('body') in ('white', 'silver', None) else 'unifi-black'
    tall = (part.get('heightMm') or 0) > partwidth(part)
    lcm = sp.get('LCM Display') or sp.get('Display')
    pr, pi = desktop_power(sp)
    y = {'y': 0.62, 'h': 0.3} if tall else {'y': 0.15, 'h': 0.7}
    ports = [{**r, **y} for r in ports]
    if gateway:
        front = [{'type': 'display', 'variant': 'lcd', 'x': 0.4, 'w': 0.2, 'y': 0.25 if not tall else 0.15, 'h': 0.4 if not tall else 0.1}] if lcm else [{'type': 'ledbar', 'x': 0.3, 'w': 0.4, 'y': 0.8, 'h': 0.03}]
        rear = ([{**pr, 'x': 0.03, **({'y': 0.7, 'h': 0.15} if tall else {})}] if pr else []) + [{**ports[0], 'x': 0.18}] + ports[1:]
        notes = 'Port counts, display and power method from the spec page; ports on the rear and display on the front follow the UniFi desktop gateway design and are not confirmed.'
    else:
        front = [{'type': 'leds', 'count': 1, 'x': 0.02, 'y': 0.08, 'h': 0.12}, {**ports[0], 'x': 0.06}] + ports[1:]
        if lcm:
            front.insert(1, {'type': 'display', 'variant': 'lcd', 'x': 0.02, 'w': 0.1, 'y': 0.25, 'h': 0.5})
            front[2] = {**front[2], 'x': 0.14}
        rear = [{**pr, 'x': 0.8}] if pr else [{'type': 'vent', 'pattern': 'holes', 'x': 0.2, 'w': 0.6, 'y': 0.3, 'h': 0.4}]
        notes = 'Port counts, PoE and power method from the spec page; ports on the front follow the UniFi desktop switch design; exact positions are estimated.'
    return {'front': {'style': preset, 'regions': front}, 'rear': {'style': preset, 'regions': rear}}, pi, notes


def partwidth(p):
    w = p['width']
    return w['mm'] if isinstance(w, dict) else {'19in': 450, '10in': 222, 'half-19in': 225}[w]


def apply_unifi():
    d = load('unifi.json')
    changed = 0
    for p in d['parts']:
        if p['id'] in HANDMADE:
            continue
        if p['formFactor'] == 'desktop' and p['category'] in ('switch', 'gateway'):
            sp = cache_specs(p)
            res = sp and unifi_desktop(p, sp)
            if res:
                faces, pi, notes = res
                p['layout'] = {'layoutVerified': False, 'sources': [p['sourceUrl']], 'notes': notes, **faces}
                if pi:
                    p['powerInput'] = pi
                changed += 1
            continue
        if p['formFactor'] != 'rack':
            continue
        sp = cache_specs(p)
        if sp is None:
            continue
        res = unifi_layout(p, sp)
        if not res:
            continue
        faces, pi, notes = res
        p['layout'] = {'layoutVerified': False, 'sources': [p['sourceUrl']], 'notes': notes, **faces}
        if pi:
            p['powerInput'] = pi
        changed += 1
    # Simple panels.
    simple = {
        'ubiquiti-uacc-rack-panel-brush-1u': [{'type': 'brush', 'x': 0.04, 'w': 0.92, 'y': 0.3, 'h': 0.4}],
        'ubiquiti-uacc-rack-panel-vented-1u': [{'type': 'vent', 'pattern': 'holes', 'x': 0.03, 'w': 0.94, 'y': 0.12, 'h': 0.76}],
        'ubiquiti-uacc-rack-panel-vented-2u': [{'type': 'vent', 'pattern': 'holes', 'x': 0.03, 'w': 0.94, 'y': 0.08, 'h': 0.84}],
    }
    for p in d['parts']:
        if p['id'] in simple:
            p['layout'] = {'layoutVerified': True, 'sources': [p['sourceUrl']], 'front': {'regions': simple[p['id']]}}
            changed += 1
    save('unifi.json', d, changed)


DELL_GUIDE = 'https://i.dell.com/sites/csdocuments/Product_Docs/en/poweredge-r740-r740xd-technical-guide.pdf'
SYN_422 = 'https://www.synology.com/en-global/products/RS422+#specs'
SYN_822 = 'https://www.synology.com/en-global/products/RS822+#specs'
APC_750 = 'https://www.se.com/us/en/product/SMT750RM1U/'


def dell_layout(model, h_u, bays, size):
    """Dell 13th/14th gen rack server: control panels either side of the drive cage; NDC, iDRAC, VGA, serial, USB and PSUs on the rear."""
    front = [
        {'type': 'leds', 'count': 3, 'colors': ['#38bdf8', '#22c55e', '#f59e0b'], 'x': 0.012, 'w': 0.035, 'y': 0.15, 'h': 0.12},
        {'type': 'usb_a', 'count': 1, 'portType': 'usb', 'role': 'iDRAC Direct', 'x': 0.012, 'w': 0.045, 'y': 0.55, 'h': 0.2},
        {'type': 'bays', 'count': bays, 'size': size, 'rows': 2, 'x': 0.07, 'w': 0.78},
        {'type': 'button', 'kind': 'power', 'x': 0.87, 'y': 0.12, 'h': 0.2},
        {'type': 'vga', 'count': 1, 'portType': 'vga', 'x': 0.86, 'w': 0.12, 'y': 0.38, 'h': 0.25},
        {'type': 'usb_a', 'count': 1, 'portType': 'usb', 'x': 0.88, 'w': 0.05, 'y': 0.72, 'h': 0.14},
        {'type': 'vent', 'pattern': 'honeycomb', 'x': 0.94, 'w': 0.05, 'y': 0.7, 'h': 0.25},
    ]
    pcie = 3 if h_u == 1 else 8 if model == 'R740' else 7
    rear = [
        {'type': 'pcie', 'count': pcie, 'x': 0.02, 'w': 0.5 if h_u == 2 else 0.4, 'y': 0.04, 'h': 0.5 if h_u == 2 else 0.45},
        {'type': 'rj45', 'count': 4, 'portType': 'rj45_1g', 'speed': '1 GbE (NDC)', 'grouping': 4, 'x': 0.04, 'w': 0.24, 'y': 0.6, 'h': 0.32},
        {'type': 'rj45', 'count': 1, 'portType': 'rj45_1g', 'role': 'iDRAC', 'start': 0, 'x': 0.3, 'w': 0.05, 'y': 0.6, 'h': 0.32},
        {'type': 'vga', 'count': 1, 'portType': 'vga', 'x': 0.36, 'w': 0.08, 'y': 0.62, 'h': 0.28},
        {'type': 'serial', 'count': 1, 'portType': 'serial', 'x': 0.45, 'w': 0.08, 'y': 0.62, 'h': 0.28},
        {'type': 'usb_a', 'count': 2, 'portType': 'usb', 'x': 0.54, 'w': 0.07, 'y': 0.62, 'h': 0.28},
        {'type': 'psu', 'count': 2, 'x': 0.66, 'w': 0.32, 'y': 0.55 if h_u == 2 else 0.08, 'h': 0.42 if h_u == 2 else 0.84},
    ]
    return front, rear


def apply_servers():
    d = load('servers.json')
    changed = 0
    spec = {'dell-poweredge-r630': ('R630', 1, 8, '2.5'), 'dell-poweredge-r730': ('R730', 2, 8, '3.5'), 'dell-poweredge-r740': ('R740', 2, 8, '3.5')}
    for p in d['parts']:
        if p['id'] not in spec:
            continue
        model, hu, bays, size = spec[p['id']]
        front, rear = dell_layout(model, hu, bays, size)
        p['ports'] = {'rj45_1g': 5, 'usb': 4, 'vga': 2, 'serial': 1}
        p['render']['preset'] = 'dell-bezel'
        p['powerInput'] = {'connector': 'iec_c14', 'adapter': 'none', 'inputs': 2, 'notes': 'Two hot-swap PSUs; each takes its own C13 lead.'}
        p['layout'] = {
            'layoutVerified': False,
            'sources': [DELL_GUIDE] + ([p['sourceUrl']] if p.get('sourceUrl') else []),
            'notes': 'Port list (front: iDRAC Direct USB, USB, VGA; rear: 4-port NDC, iDRAC, VGA, serial, 2 × USB, PCIe risers, 2 PSUs) from the R740 technical guide; the R630/R730 follow the same 13th/14th-gen layout. Exact positions are estimated from the guide\'s chassis drawings.',
            'front': {'style': 'dell-bezel', 'regions': front},
            'rear': {'style': 'dell-bezel', 'regions': rear},
        }
        changed += 1
    save('servers.json', d, changed)


def apply_storage():
    d = load('storage.json')
    changed = 0
    for p in d['parts']:
        if p['id'] == 'synology-rs422-plus':
            p['ports'] = {'rj45_1g': 2, 'usb': 1, 'console': 1}
            p['powerInput'] = {'connector': 'iec_c14', 'adapter': 'none', 'notes': 'Single 100 W PSU, 100–240 V AC.'}
            p['layout'] = {
                'layoutVerified': False, 'sources': [SYN_422],
                'notes': 'Bays, ports (2 × 1GbE, USB 3.2, console), network upgrade slot, 100 W PSU and three 40 mm fans from the spec page; which face each sits on, and positions, are estimated.',
                'front': {'style': 'synology', 'regions': [
                    {'type': 'button', 'kind': 'power', 'x': 0.015, 'y': 0.2, 'h': 0.22},
                    {'type': 'leds', 'count': 2, 'x': 0.012, 'w': 0.04, 'y': 0.6, 'h': 0.12},
                    {'type': 'bays', 'count': 4, 'size': '3.5', 'x': 0.07, 'w': 0.84, 'rows': 1},
                    {'type': 'label', 'text': p['model'], 'x': 0.925, 'y': 0.15, 'size': 3}]},
                'rear': {'style': 'synology', 'regions': [
                    {'type': 'fan', 'count': 3, 'x': 0.02, 'w': 0.3},
                    {'type': 'pcie', 'count': 1, 'x': 0.35, 'w': 0.08, 'y': 0.15, 'h': 0.7},
                    {'type': 'rj45', 'count': 2, 'portType': 'rj45_1g', 'x': 0.46},
                    {'type': 'usb_a', 'count': 1, 'portType': 'usb'},
                    {'type': 'console', 'count': 1, 'portType': 'console', 'role': 'Console'},
                    {'type': 'button', 'kind': 'pinhole'},
                    {'type': 'iec_c14', 'count': 1, 'role': 'AC in', 'x': 0.86}]},
            }
            changed += 1
        if p['id'] == 'synology-rs822-plus':
            p['powerInput'] = {'connector': 'iec_c14', 'adapter': 'none'}
            p['layout'] = {
                'layoutVerified': False, 'sources': [SYN_822],
                'notes': 'Four 3.5" bays and four 1GbE ports per the catalog entry (Synology\'s spec page could not be loaded); rear positions estimated from the RS422+ chassis.',
                'front': {'style': 'synology', 'regions': [
                    {'type': 'button', 'kind': 'power', 'x': 0.015, 'y': 0.2, 'h': 0.22},
                    {'type': 'leds', 'count': 2, 'x': 0.012, 'w': 0.04, 'y': 0.6, 'h': 0.12},
                    {'type': 'bays', 'count': 4, 'size': '3.5', 'x': 0.07, 'w': 0.84, 'rows': 1},
                    {'type': 'label', 'text': p['model'], 'x': 0.925, 'y': 0.15, 'size': 3}]},
                'rear': {'style': 'synology', 'regions': [
                    {'type': 'fan', 'count': 3, 'x': 0.02, 'w': 0.3},
                    {'type': 'pcie', 'count': 1, 'x': 0.35, 'w': 0.08, 'y': 0.15, 'h': 0.7},
                    {'type': 'rj45', 'count': 4, 'portType': 'rj45_1g', 'grouping': 4, 'x': 0.46},
                    {'type': 'iec_c14', 'count': 1, 'role': 'AC in', 'x': 0.86}]},
            }
            changed += 1
    save('storage.json', d, changed)


def apply_power():
    d = load('power.json')
    changed = 0
    ups_front = lambda model: [
        {'type': 'display', 'variant': 'lcd', 'x': 0.03, 'w': 0.1, 'y': 0.25, 'h': 0.5},
        {'type': 'button', 'kind': 'power', 'x': 0.15, 'y': 0.35, 'h': 0.3},
        {'type': 'button', 'kind': 'push', 'x': 0.18, 'y': 0.38, 'h': 0.24},
        {'type': 'button', 'kind': 'push', 'x': 0.21, 'y': 0.38, 'h': 0.24},
        {'type': 'label', 'text': model, 'x': 0.27, 'y': 0.12, 'size': 3.2},
        {'type': 'vent', 'pattern': 'slots', 'x': 0.27, 'w': 0.7, 'y': 0.35, 'h': 0.55},
        {'type': 'ledbar', 'color': '#22c55e', 'x': 0.03, 'w': 0.2, 'y': 0.85, 'h': 0.04},
    ]
    for p in d['parts']:
        if p['id'].startswith('apc-smt'):
            outlets = [(t, n) for t, n in p['ports'].items() if n]
            rear = [{'type': 'fan', 'count': 1, 'x': 0.03, 'w': 0.08}]
            for t, n in outlets:
                conn = {'outlet_nema': 'outlet_nema', 'outlet_c13': 'iec_c13', 'outlet_c19': 'iec_c19'}[t]
                rear.append({'type': conn, 'count': n, 'portType': t, 'x': 0.16, 'w': 0.5})
            rear += [
                {'type': 'slot', 'x': 0.69, 'w': 0.08, 'y': 0.2, 'h': 0.1},
                {'type': 'serial', 'count': 1, 'portType': 'none', 'role': 'Serial', 'x': 0.69, 'w': 0.07, 'y': 0.45, 'h': 0.2},
                {'type': 'usb_a', 'count': 1, 'portType': 'none', 'role': 'USB', 'x': 0.78, 'w': 0.04, 'y': 0.5, 'h': 0.12},
                {'type': 'iec_c20' if 'RMI' in p['model'] and (p['ups']['capacityVA'] or 0) > 2000 else 'iec_c14', 'count': 1, 'role': 'AC in', 'x': 0.86},
            ]
            if not outlets:
                rear = [r for r in rear if r['type'] not in ('outlet_nema', 'iec_c13')]
            p['layout'] = {'layoutVerified': False, 'sources': [p['sourceUrl']] if p.get('sourceUrl') else [],
                           'notes': 'LCD, buttons, outlet count/type and USB/serial/SmartSlot interfaces from APC data; positions estimated.',
                           'front': {'style': 'ups', 'regions': ups_front(p['model'])}, 'rear': {'style': 'ups', 'regions': rear}}
            p['powerInput'] = {'connector': 'hardwired' if 'RMI' not in p['model'] else 'iec_c14', 'adapter': 'none'}
            changed += 1
        if p['id'].startswith('generic-pdu-1u'):
            (t, n), = [(t, n) for t, n in p['ports'].items() if n]
            conn = {'outlet_c13': 'iec_c13', 'outlet_au': 'outlet_au', 'outlet_uk': 'outlet_uk', 'outlet_nema': 'outlet_nema', 'outlet_schuko': 'outlet_schuko'}[t]
            p['layout'] = {'layoutVerified': False, 'sources': [], 'notes': 'Generic horizontal PDU: outlets, rocker switch and breaker.',
                           'front': {'style': 'pdu', 'regions': [
                               {'type': 'breaker', 'x': 0.02, 'y': 0.25, 'h': 0.5},
                               {'type': conn, 'count': n, 'portType': t, 'x': 0.07, 'w': 0.82, 'y': 0.08, 'h': 0.84},
                               {'type': 'switch', 'variant': 'rocker', 'count': 1, 'x': 0.92, 'y': 0.2, 'h': 0.6}]}}
            p['powerInput'] = {'connector': 'hardwired', 'adapter': 'none'}
            changed += 1
    # 1U Smart-UPS (verified from APC's datasheet).
    if not any(p['id'] == 'apc-smt750rm1u' for p in d['parts']):
        d['parts'].append({
            'id': 'apc-smt750rm1u', 'brand': 'APC', 'model': 'SMT750RM1U', 'name': 'APC Smart-UPS 750VA 1U (120V)', 'category': 'power', 'subcategory': 'ups',
            'formFactor': 'rack', 'heightU': 1, 'width': '19in', 'depthMm': 502, 'mounting': 'full-depth', 'rackWidths': ['19in'],
            'power': {'typicalW': None, 'maxW': None}, 'weightKg': 15.8, 'ports': {'outlet_nema': 4},
            'ups': {'capacityW': 600, 'capacityVA': 750}, 'render': {'style': 'ups', 'body': 'black', 'accent': '#00a651'},
            'powerInput': {'connector': 'hardwired', 'adapter': 'none', 'notes': 'Fixed NEMA 5-15P cord, 2.4 m.'},
            'tags': ['ups', 'apc', 'smart-ups', '1u', 'short-depth'], 'sourceUrl': APC_750, 'verified': True,
            'notes': '750 VA / 600 W line-interactive, sine wave. 432 × 502 × 44 mm, 15.8 kg. 4 × NEMA 5-15R, USB, serial and one SmartSlot; LCD console. 120 V.',
        })
    for p in d['parts']:
        if p['id'] == 'apc-smt750rm1u':
            p['layout'] = {'layoutVerified': True, 'sources': [APC_750, 'https://cdn.blueally.com/apcguard/datasheets/SMT750RM1U_datasheet.pdf'],
                           'notes': 'Feature list from the APC datasheet; positions follow the Smart-UPS 1U chassis.',
                           'front': {'style': 'ups', 'regions': [
                               {'type': 'display', 'variant': 'lcd', 'x': 0.03, 'w': 0.1, 'y': 0.2, 'h': 0.6},
                               {'type': 'button', 'kind': 'power', 'x': 0.15, 'y': 0.3, 'h': 0.4},
                               {'type': 'button', 'kind': 'push', 'x': 0.185, 'y': 0.33, 'h': 0.34},
                               {'type': 'vent', 'pattern': 'slots', 'x': 0.25, 'w': 0.72, 'y': 0.15, 'h': 0.7}]},
                           'rear': {'style': 'ups', 'regions': [
                               {'type': 'outlet_nema', 'count': 4, 'portType': 'outlet_nema', 'x': 0.04, 'w': 0.4},
                               {'type': 'slot', 'x': 0.5, 'w': 0.1, 'y': 0.3, 'h': 0.12},
                               {'type': 'serial', 'count': 1, 'portType': 'none', 'role': 'Serial', 'x': 0.63, 'w': 0.07},
                               {'type': 'usb_a', 'count': 1, 'portType': 'none', 'role': 'USB', 'x': 0.72, 'w': 0.04},
                               {'type': 'fan', 'count': 1, 'x': 0.8, 'w': 0.08}]}}
            changed += 1
    save('power.json', d, changed)


def apply_passive():
    d = load('patch-panels.json')
    changed = 0
    for p in d['parts']:
        pid, k, hu = p['id'], p['ports'].get('keystone', 0), p['heightU']
        L = None
        if pid.startswith('generic-patch') and k:
            punch = 'punch' in pid or (p.get('depthMm') or 0) >= 60 and 'keystone' not in pid
            rows = 2 if k > 24 else 1
            front = [{'type': 'keystone', 'count': k, 'numbers': hu >= 1, 'grouping': 6, 'rows': rows,
                      **({'colors': ['#1f2937'] * k} if punch else {}),
                      'x': 0.03, 'w': 0.94, 'y': 0.05 if hu >= 1 else 0.08, 'h': (0.72 if hu >= 1 else 0.84)}]
            if hu >= 1:
                front.append({'type': 'label_strip', 'x': 0.05, 'w': 0.9, 'y': 0.82, 'h': 0.1 if hu == 1 else 0.05})
            bar = (p.get('depthMm') or 0) >= 80
            rear = [{'type': 'punchdown' if punch else 'coupler', 'count': k, 'portType': 'none', 'numbers': hu >= 1, 'grouping': 6, 'rows': rows,
                     'x': 0.03, 'w': 0.94, **({'y': 0.03, 'h': 0.78} if bar else {})}]
            if bar:
                rear.append({'type': 'cable_bar', 'x': 0.02, 'w': 0.96, 'y': 0.85, 'h': 0.12})
            L = {'front': {'style': 'patch-panel', 'regions': front}, 'rear': {'style': 'patch-panel', 'regions': rear}}
        elif pid.startswith('generic-brush'):
            L = {'front': {'style': 'brush-panel', 'regions': [{'type': 'brush', 'x': 0.04, 'w': 0.92, 'y': 0.3 if hu == 1 else 0.25, 'h': 0.4 if hu == 1 else 0.5}]}}
        elif pid.startswith('generic-vented'):
            L = {'front': {'regions': [{'type': 'vent', 'pattern': 'holes', 'x': 0.03, 'w': 0.94, 'y': 0.12, 'h': 0.76}]}}
        elif pid.startswith('generic-blank'):
            L = {'front': {'regions': [{'type': 'thumbscrew', 'x': 0.02, 'y': 0.4, 'h': 0.2 / hu}, {'type': 'thumbscrew', 'x': 0.96, 'y': 0.4, 'h': 0.2 / hu}]}}
        if L:
            p['layout'] = {'layoutVerified': False, 'sources': [], 'notes': 'Generic part: typical layout, positions estimated.', **L}
            changed += 1
    save('patch-panels.json', d, changed)


if __name__ == '__main__':
    apply_unifi()
    apply_servers()
    apply_storage()
    apply_power()
    apply_passive()
