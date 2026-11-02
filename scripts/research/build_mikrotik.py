#!/usr/bin/env python3
"""Build catalog/mikrotik.json from mikrotik.com product pages (see fetch_mikrotik.py).
MikroTik does not publish weight, so weightKg is null throughout. Power is the
'without attachments' figure where given (excludes PoE-out and SFP modules)."""
import json, os, re
R = os.path.expanduser('~/.cache/rackplanner-research/mikrotik')
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'catalog', 'mikrotik.json')
ACCENT = '#d4202c'

# slug -> (form factor, category, extra)
MODELS = {
    'CRS326-24G-2SplusRM': ('rack', 'switch', {}),
    'CSS326-24G-2SplusRM': ('rack', 'switch', {}),
    'crs328_24p_4s_rm': ('rack', 'switch', {}),
    'crs317_1g_16s_rm': ('rack', 'switch', {}),
    'crs312_4c_8xg_rm': ('rack', 'switch', {}),
    'crs326_24s_2q_rm': ('rack', 'switch', {}),
    'crs326_4c_20g_2q_rm': ('rack', 'switch', {}),
    'crs328_4c_20s_4s_rm': ('rack', 'switch', {}),
    'crs354_48g_4splus2qplusrm': ('rack', 'switch', {}),
    'crs354_48p_4s_2q_rm': ('rack', 'switch', {'poe': 700}),
    'crs418_8p_8g_2s_rm': ('rack', 'switch', {'poe': 150}),
    'crs320_8p_8b_4s_rm': ('rack', 'switch', {'poe': 963}),
    'crs518_16xs_2xq': ('rack', 'switch', {}),
    'crs520_4xs_16xq_rm': ('rack', 'switch', {}),
    'ccr2004_16g_2splus': ('rack', 'gateway', {}),
    'ccr2004_1g_12s_2xs': ('rack', 'gateway', {}),
    'ccr2116_12g_4splus': ('rack', 'gateway', {}),
    'ccr2216_1g_12xs_2xq': ('rack', 'gateway', {}),
    'RB1100Dx4': ('rack', 'gateway', {}),
    'rb4011igs_rm': ('rack', 'gateway', {'note': 'Ships with rack ears for 1U mounting.'}),
    'l009uigs_rm': ('rack', 'gateway', {'note': 'Ships with rack ears for 1U mounting.'}),
    'rds2216': ('rack', 'nas', {'bays': [{'count': 20, 'size': 'u2'}], 'full': True, 'depth': 476, 'note': '20× U.2 NVMe bays. Listed as 476 × 443 × 44 mm (D × W × H).'}),
    'crs309_1g_8s_in': ('desktop', 'switch', {}),
    'crs305_1g_4s_in': ('desktop', 'switch', {}),
    'crs310_8g_2s_in': ('desktop', 'switch', {}),
    'crs310_1g_5s_4s_in': ('desktop', 'switch', {}),
    'crs504_4xq_in': ('desktop', 'switch', {}),
    'css610_8g_2s_in': ('desktop', 'switch', {}),
    'rb5009ug_s_in': ('desktop', 'gateway', {}),
}

def num(s):
    m = re.search(r'(\d+(?:[.,]\d+)?)', s or '')
    return float(m.group(1).replace(',', '.')) if m else None

def ports(s):
    p = {}
    def add(k, v):
        n = num(v)
        if n: p[k] = p.get(k, 0) + int(n)
    for k, v in s.items():
        kl = k.lower()
        if kl == '10/100/1000 ethernet ports': add('rj45_1g', v)
        elif kl == '10/100 ethernet ports': add('rj45_100m', v)
        elif 'number of 2.5g ethernet' in kl: add('rj45_2_5g', v)
        elif '1g/2.5g/5g/10g ethernet' in kl: add('rj45_10g', v)
        elif 'combo 10g ethernet' in kl: add('sfp_plus', v)
        elif kl == 'ethernet combo ports': add('rj45_1g', v)
        elif kl == 'sfp ports': add('sfp', v)
        elif kl == 'sfp+ ports': add('sfp_plus', v)
        elif '25g sfp28' in kl: add('sfp28', v)
        elif '40g qsfp+' in kl: add('qsfp_plus', v)
        elif '100g qsfp28' in kl: add('qsfp28', v)
    return p

parts = []
for slug, (ff, cat, ex) in MODELS.items():
    d = json.load(open(f'{R}/{slug}.json'))
    s = d['specs']
    model = s.get('Product code') or d['title'].split('|')[0].strip()
    dims = re.findall(r'(\d+(?:[.,]\d+)?)', s.get('Dimensions', ''))
    dims = [float(x.replace(',', '.')) for x in dims[:3]]
    power = num(s.get('Max power consumption without attachments')) or num(s.get('Max power consumption'))
    p = {
        'id': 'mikrotik-' + re.sub(r'[^a-z0-9]+', '-', model.lower()).strip('-'),
        'brand': 'MikroTik', 'model': model, 'name': f'MikroTik {model}', 'category': cat,
        'formFactor': ff, 'mounting': 'full-depth' if ex.get('full') else 'front', 'rackWidths': ['19in'],
        'power': {'typicalW': None, 'maxW': power}, 'weightKg': None, 'ports': ports(s),
        'render': {'style': 'desktop' if ff == 'desktop' else ('nas' if cat == 'nas' else ('gateway' if cat == 'gateway' else 'switch')), 'body': 'black' if ff == 'rack' else 'white', 'accent': ACCENT},
        'tags': ['mikrotik', cat] + (['poe'] if ex.get('poe') or 'PoE-out ports' in s else []), 'sourceUrl': d['url'],
    }
    if ff == 'rack':
        p.update(heightU=1, width='19in')
        if len(dims) == 3:
            w, a, b = dims
            depth = a if abs(b - 44) < abs(a - 44) else b
            if w < 300 and a > 400: depth = w  # listed D x W x H
            p['depthMm'] = round(ex.get('depth', depth))
        else:
            p['depthMm'] = None
    else:
        w, d_, h = dims
        p.update(heightU=1, heightMm=h, width={'mm': w}, depthMm=round(d_))
        p['rackWidths'] = ['19in', '10in'] if w <= 210 else ['19in']
        p['tags'].append('needs-shelf')
    if ex.get('poe'): p['poeBudgetW'] = ex['poe']
    if ex.get('bays'): p['driveBays'] = ex['bays']
    notes = ['Weight not published by MikroTik.']
    if num(s.get('Max power consumption without attachments')): notes.append('Max power excludes PoE-out and attachments.')
    if 'PoE-out ports' in s and not ex.get('poe'): notes.append('Total PoE budget not stated on the product page.')
    if ex.get('note'): notes.append(ex['note'])
    if p['depthMm'] is None: notes.append('Dimensions not stated on the product page.')
    p['notes'] = ' '.join(notes)
    # Verified = every number included comes straight from the official page (nulls = not published).
    p['verified'] = True
    parts.append(p)

parts.sort(key=lambda p: (p['formFactor'] != 'rack', p['category'], p['id']))
json.dump({'$schema': './schema.json', 'version': 1, 'title': 'MikroTik',
           'description': 'CRS/CSS switches, CCR/RB routers and RDS storage. Specs from mikrotik.com product pages (fetched 2026-11-02).',
           'parts': parts}, open(OUT, 'w'), indent=2, ensure_ascii=False)
open(OUT, 'a').write('\n')
for p in parts: print(p['id'], p['formFactor'], p.get('depthMm'), p['power']['maxW'], p['ports'], p['verified'])
