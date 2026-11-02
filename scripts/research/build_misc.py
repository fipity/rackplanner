#!/usr/bin/env python3
"""
Build the non-UniFi, non-MikroTik catalog files from researched data.

Every entry carries the URL its numbers came from. `verified: true` only when
that URL is the manufacturer's own spec page or datasheet. Figures taken from
resellers / rack-vendor guides are `verified: false`, and anything that could
not be found (or where sources disagreed) is left `null` with a note.

Run:  python3 scripts/research/build_misc.py
"""
import json
import math
import os

HERE = os.path.dirname(__file__)
CAT = os.path.join(HERE, '..', '..', 'catalog')
R = os.path.expanduser('~/.cache/rackplanner-research/unifi')
U = 44.45


def write(name, title, description, parts, version):
    parts.sort(key=lambda p: (p['category'], p.get('subcategory', ''), p['id']))
    with open(os.path.join(CAT, name), 'w') as f:
        json.dump({'$schema': './schema.json', 'version': version, 'title': title, 'description': description, 'parts': parts},
                  f, indent=2, ensure_ascii=False)
        f.write('\n')
    print(f'{name}: {len(parts)} parts, {sum(not p["verified"] for p in parts)} unverified')


def part(id, brand, model, name, category, *, hu=1, width='19in', depth=None, mounting='front', rack=('19in',), typ=None, mx=None,
         poe=None, kg=None, ports=None, bays=None, style='switch', body='black', accent=None, tags=(), url=None, verified=False,
         notes=None, sub=None, ff='rack', hmm=None, shelf=None, ups=None, legacy=False):
    p = {
        'id': id, 'brand': brand, 'model': model, 'name': name, 'category': category,
        **({'subcategory': sub} if sub else {}),
        'formFactor': ff, 'heightU': hu, **({'heightMm': hmm} if hmm else {}),
        'width': width, 'depthMm': depth, 'mounting': mounting, 'rackWidths': list(rack),
        'power': {'typicalW': typ, 'maxW': mx}, **({'poeBudgetW': poe} if poe else {}),
        'weightKg': kg, 'ports': ports or {}, **({'driveBays': bays} if bays else {}),
        **({'shelf': shelf} if shelf else {}), **({'ups': ups} if ups else {}),
        'render': {'style': style, 'body': body, **({'accent': accent} if accent else {})},
        'tags': [t for t in [brand.lower().replace(' ', '-'), category, *tags] if t],
        **({'legacy': True} if legacy else {}),
        'sourceUrl': url, 'verified': verified,
        **({'notes': notes} if notes else {}),
    }
    if poe and 'poe' not in p['tags']:
        p['tags'].append('poe')
    return p


def desktop(id, brand, model, name, category, w, d, h, **kw):
    kw.setdefault('style', 'desktop')
    kw.setdefault('body', 'grey')
    rack = ('19in', '10in') if w <= 210 else ('19in',)
    p = part(id, brand, model, name, category, hu=max(1, math.ceil(h / U - 0.02)), width={'mm': w}, depth=round(d), rack=rack,
             ff='desktop', hmm=h, **kw)
    p['tags'].append('needs-shelf')
    return p


# ---------------------------------------------------------------------------
# Servers & storage
# ---------------------------------------------------------------------------
DELL = '#0076ce'
HPE = '#01a982'
SMC = '#2f6db5'
RS = 'https://www.racksolutions.com/news/blog/'


def servers():
    S = []
    def D(slug, model, hu, depth, kg, bays, url, notes, legacy=True, ports=None):
        S.append(part(f'dell-poweredge-{slug}', 'Dell', f'PowerEdge {model}', f'Dell PowerEdge {model}', 'server', hu=hu, depth=depth,
                      mounting='full-depth', kg=kg, ports=ports or {'rj45_1g': 4}, bays=bays, style='server', accent=DELL,
                      tags=('poweredge', 'legacy') if legacy else ('poweredge',), url=url, notes=notes, legacy=legacy))
    pw = 'Power draw depends on configuration, so it is left blank; add your own measurement via a custom part.'
    D('r220', 'R220', 1, 394, 8.06, [{'count': 2, 'size': '3.5'}], RS + 'dell-poweredge-r220-specs-and-rack-compatibility/',
      f'Depth 394.3 mm (one source says 429 mm). Single 250 W PSU. {pw}', ports={'rj45_1g': 2})
    D('r230', 'R230', 1, 495, 10.6, [{'count': 4, 'size': '3.5'}], RS + 'dell-poweredge-r230-specs-and-rack-compatibility/',
      f'Single 250 W cabled PSU. {pw}', ports={'rj45_1g': 2})
    D('r240', 'R240', 1, 596, 12.2, [{'count': 4, 'size': '3.5'}], 'https://quickserv.co.th/server/DELL/Rack-1U-:-Single-Socket/detail/Dell-PowerEdge-R240/SNSR240D.html',
      f'Depth for the 3.5" configuration, excluding bezel. 250 W PSU. {pw}', ports={'rj45_1g': 2})
    D('r340', 'R340', 1, None, None, [{'count': 4, 'size': '3.5'}], None,
      f'Depth and weight not found from a reliable source. Bay layout is the common 4× 3.5" configuration. {pw}', ports={'rj45_1g': 2})
    D('r620', 'R620 (8× 2.5")', 1, 703, 19.76, [{'count': 8, 'size': '2.5'}], RS + 'dell-poweredge-r620-specs-and-rack-compatibility/',
      f'Max weight (10-bay chassis 43.56 lb). PSU options 495/750/1100 W. {pw}')
    D('r630', 'R630 (8× 2.5")', 1, 769, 17.4, [{'count': 8, 'size': '2.5'}], RS + 'dell-poweredge-r630-specs-and-rack-compatibility/',
      f'Sources give 755–769 mm depth; the larger value is used. {pw}')
    D('r640', 'R640 (8× 2.5")', 1, 758, None, [{'count': 8, 'size': '2.5'}], 'https://www.stikc.com/pages/refurbished-dell-servers/poweredge-r640',
      f'Depth for the 8× 2.5" configuration (808.5 mm for 4× 3.5" / 10× 2.5"). {pw}', legacy=False)
    D('r720', 'R720 (8× 3.5")', 2, 756, 30.9, [{'count': 8, 'size': '3.5'}], RS + 'dell-poweredge-r720-specs-and-rack-compatibility/',
      f'Max weight for 3.5" systems. PSU options 495/750/1100 W. {pw}')
    D('r720xd', 'R720xd (12× 3.5")', 2, 723, 32.5, [{'count': 12, 'size': '3.5'}], 'https://help.racksolutions.com/hc/en-us/articles/11659948072084-Dell-PowerEdge-R720xd-Specs-and-Rack-Compatibility',
      f'Plus 2 optional rear 2.5" bays. {pw}')
    D('r730', 'R730 (8× 3.5")', 2, None, None, [{'count': 8, 'size': '3.5'}], None,
      f'Depth/weight not found from a reliable source (shares the R730xd chassis length of ~684 mm per rack vendors). {pw}')
    D('r730xd', 'R730xd (12× 3.5")', 2, 684, 32.5, [{'count': 12, 'size': '3.5'}], RS + 'dell-poweredge-r730xd-specs-and-rack-compatibility/',
      f'Max weight for the 3.5" chassis. {pw}')
    D('r740', 'R740 (8× 3.5")', 2, None, 33.1, [{'count': 8, 'size': '3.5'}], 'https://pcserverandparts.com/content/Spec%20Sheets/Servers/Dell/Dell%20PowerEdge%20R740/Dell%20EMC%20PowerEdge%20R740%20Technical%20Specifications.pdf',
      f'Max weight for 3.5" systems; depth not found. {pw}', legacy=False)
    D('r740xd', 'R740xd (12× 3.5")', 2, 716, 33.1, [{'count': 12, 'size': '3.5'}], 'https://pcserverandparts.com/content/Spec%20Sheets/Servers/Dell/Dell%20PowerEdge%20R740XD/Dell%20EMC%20PowerEdge%20R740XD%20Technical%20Specifications.pdf',
      f'Depth 715.5 mm per Dell spec copy (rack vendors quote 737.5 mm). {pw}', legacy=False)

    def H(slug, model, hu, depth, kg, bays, url, notes, legacy=True):
        S.append(part(f'hpe-proliant-{slug}', 'HPE', f'ProLiant {model}', f'HPE ProLiant {model}', 'server', hu=hu, depth=depth,
                      mounting='full-depth', kg=kg, ports={'rj45_1g': 4}, bays=bays, style='server', accent=HPE,
                      tags=('proliant', 'legacy') if legacy else ('proliant',), url=url, notes=notes, legacy=legacy))
    H('dl20-gen9', 'DL20 Gen9 (2× LFF)', 1, 382, 7.9, [{'count': 2, 'size': '3.5'}], 'https://racksolutions.com/news/blog/hpe-proliant-dl20-gen9-specs-and-rack-compatibility',
      f'290 W non-redundant PSU standard. {pw}')
    H('dl20-gen10-plus', 'DL20 Gen10 Plus', 1, 382, 10.0, None, 'https://www.uk.shi.com/product/44512609/HPE-ProLiant-DL20-Gen10-Plus-Performance',
      f'290 W or 500 W redundant PSU options. {pw}', legacy=False)
    H('dl360-gen8', 'DL360 Gen8 (8× SFF)', 1, None, None, [{'count': 8, 'size': '2.5'}], None, f'Dimensions not found from a reliable source. {pw}')
    H('dl360-gen9', 'DL360 Gen9 (8× SFF)', 1, 699, 15.31, [{'count': 8, 'size': '2.5'}], RS + 'hpe-proliant-dl360-gen9-how-to-mount/',
      f'27.5" depth for 8/10 SFF (29.5" for 4 LFF). {pw}')
    H('dl360-gen10', 'DL360 Gen10 (8× SFF)', 1, 707, 16.3, [{'count': 8, 'size': '2.5'}], RS + 'hpe-proliant-dl360-how-to-mount/',
      f'Max weight 35.86 lb. {pw}', legacy=False)
    H('dl380-gen8', 'DL380 Gen8 (8× SFF)', 2, None, None, [{'count': 8, 'size': '2.5'}], None, f'Dimensions not found from a reliable source. {pw}')
    H('dl380-gen9', 'DL380 Gen9 (8× SFF)', 2, 679, 23.6, [{'count': 8, 'size': '2.5'}], RS + 'hpe-proliant-dl380-how-to-mount/', pw)
    H('dl380-gen10', 'DL380 Gen10 (8× SFF)', 2, 679, None, [{'count': 8, 'size': '2.5'}], 'https://help.racksolutions.com/hc/en-us/articles/11756372936596-HPE-ProLiant-DL380-Gen10-Specs-and-Rack-Compatibility',
      f'679 mm for SFF, 730 mm for LFF models. Weight figures conflict (14.8–17.1 kg). {pw}', legacy=False)

    def SM(model, hu, depth, bays, notes):
        S.append(part(f'supermicro-{model.lower()}', 'Supermicro', model, f'Supermicro {model} chassis', 'server', hu=hu, depth=depth,
                      mounting='full-depth', bays=bays, style='server', accent=SMC, tags=('chassis',), sub='chassis', notes=notes))
    SM('CSE-815', 1, 650, [{'count': 4, 'size': '3.5'}], 'Depth from a reseller listing. Weight varies by PSU option.')
    SM('CSE-825', 2, None, [{'count': 8, 'size': '3.5'}], 'Dimensions not found; 8× 3.5" is the standard bay layout.')
    SM('CSE-836', 3, 648, [{'count': 16, 'size': '3.5'}], 'Depth (25.5") from a used-market listing.')
    SM('CSE-846', 4, None, [{'count': 24, 'size': '3.5'}], 'Dimensions not found.')
    SM('CSE-847', 4, None, [{'count': 24, 'size': '3.5'}], '36 bays total: 24 front + 12 rear (only the front 24 are drawn). Dimensions not found.')

    for hu in (1, 2, 3, 4):
        S.append(part(f'generic-atx-case-{hu}u', 'Generic', f'ATX-{hu}U', f'Generic {hu}U ATX server case', 'server', hu=hu, mounting='full-depth',
                      style='server', body='black', tags=('chassis', 'diy'), sub='chassis',
                      notes='Generic DIY chassis (Rosewill/Sliger style). Depth varies widely by model; set it via a custom part if it matters.'))
    S.append(part('rosewill-rsv-l4500u', 'Rosewill', 'RSV-L4500U', 'Rosewill RSV-L4500U 4U case (15× 3.5")', 'server', hu=4, mounting='full-depth',
                  bays=[{'count': 15, 'size': '3.5'}], style='server', tags=('chassis', 'diy'), sub='chassis',
                  url='https://www.rosewill.com/', notes='Popular home-lab storage case. Bays are internal cages behind a front door; depth not confirmed.'))
    return S


def storage():
    S = []
    def SY(model, hu, depth, kg, bays, ports, access, url_model, notes='', verified=True, url=None):
        S.append(part(f'synology-{model.lower().replace("+", "-plus").replace(" ", "-")}', 'Synology', model, f'Synology RackStation {model}', 'nas',
                      hu=hu, depth=round(depth), mounting='full-depth' if depth >= 400 else 'front', kg=kg, typ=access, bays=bays,
                      ports=ports, style='nas', accent='#b5b5b6', tags=('rackstation',), sub='rackstation',
                      url=url or f'https://www.synology.com/en-global/products/{url_model}#specs', verified=verified,
                      notes=(notes + ' ' if notes else '') + 'Typical power is Synology\'s "Access" figure with drives installed.'))
    b = lambda n, m2=0: [{'count': n, 'size': '3.5'}] + ([{'count': m2, 'size': 'm2'}] if m2 else [])
    SY('RS422+', 1, 327.5, 4.38, b(4), {'rj45_1g': 2}, 37.93, 'RS422+', 'Depth includes handles. 100 W PSU.')
    SY('RS826+', 1, 492.6, 6.4, b(4), {'rj45_1g': 4}, 37.73, 'RS826+', '150 W PSU; expandable to 8 bays with RX426.')
    SY('RS826RP+', 1, 518.6, 8.0, b(4), {'rj45_1g': 4}, 46.07, 'RS826RP+', 'Redundant 150 W PSUs.')
    SY('RS1226+', 2, 306.6, 6.8, b(8, 2), {'rj45_2_5g': 2}, 72.33, 'RS1226+', '250 W PSU.')
    SY('RS1226RP+', 2, 398.4, 8.9, b(8, 2), {'rj45_2_5g': 2}, 81.82, 'RS1226RP+', 'Redundant 550 W PSUs.')
    SY('RS1221+', 2, 306.6, 6.9, b(8), {'rj45_1g': 4}, 49.89, 'RS1221+', '250 W PSU; expandable to 12 bays with RX418.')
    SY('RS1221RP+', 2, 407.5, 8.4, b(8), {'rj45_1g': 4}, 61.94, 'RS1221+', 'Redundant 350 W PSUs.')
    SY('RS2423+', 2, 552, 11.5, b(12), {'rj45_1g': 2, 'rj45_10g': 1}, 119.95, 'RS2423+', '500 W PSU.')
    SY('RS2423RP+ II', 2, 578, 11.9, b(12), {'rj45_1g': 2, 'rj45_10g': 1}, 114.86, 'RS2423RP+II', 'Redundant 550 W PSUs.')
    SY('RS2825RP+', 3, 656.5, 17.3, b(16), {'rj45_1g': 2, 'rj45_10g': 1}, 134.48, 'RS2825RP+', 'Redundant 550 W PSUs; up to 28 bays with RX1225RP.')
    SY('RS1626xs+', 1, 668.5, 9.5, b(4, 2), {'rj45_10g': 2, 'rj45_1g': 1}, 97.59, 'RS1626xs+', 'Includes an out-of-band management port. Expandable to 16 bays.')
    SY('RS822+', 1, 492.6, 6.4, b(4), {'rj45_1g': 4}, 47.69, 'RS822+', 'Discontinued; specs from a secondary source.', verified=False,
       url='https://nascompares.com/news/synology-rs822-rs822rp4-bay-1u-rackmount-nas/')
    S[-1]['legacy'] = True
    S[-1]['tags'].append('legacy')
    return S


def qnap():
    """QNAP rack NAS from qnap.com hardware spec pages (fetched 2026-11-02)."""
    S = []
    def Q(model, hu, depth, kg, bays, ports, typ, standby, psu, notes=''):
        slug = model.lower().replace(' ', '-')
        url = f'https://www.qnap.com/en/product/{slug}/specs/hardware'
        extra = f' HDD standby {standby} W.' if standby else ''
        p = part(f'qnap-{slug}', 'QNAP', model, f'QNAP {model}', 'nas', hu=hu, depth=round(depth),
                 mounting='full-depth' if depth >= 400 else 'front', kg=kg, typ=typ, bays=bays, ports=ports,
                 style='nas', accent='#1b65c4', tags=('rackmount',), sub='qnap', url=url, verified=True,
                 notes=(f'{notes} ' if notes else '') + f'Typical power is QNAP\'s operating figure with drives installed.{extra} PSU: {psu}. Depth excludes ears and protruding PSU.')
        S.append(p)
    b35 = lambda n: [{'count': n, 'size': '3.5'}]
    Q('TS-432PXU', 1, 479, 7.39, b35(4), {'rj45_2_5g': 2, 'sfp_plus': 2}, 39.6, None, '250 W')
    Q('TS-432PXU-RP', 1, 479, 9.08, b35(4), {'rj45_2_5g': 2, 'sfp_plus': 2}, 53.3, None, '2× 250 W redundant')
    Q('TS-464U', 1, 479, 7.52, b35(4), {'rj45_2_5g': 2}, 36.8, 22.3, '250 W')
    Q('TS-464U-RP', 1, 479, 9.34, b35(4), {'rj45_2_5g': 2}, 51.4, 37.5, '2× 250 W redundant')
    Q('TS-h987XU-RP', 1, 479, 9.5, [{'count': 4, 'size': '3.5'}, {'count': 5, 'size': 'u2'}], {'rj45_2_5g': 2, 'rj45_10g': 2}, 120.6, 114.6,
      '2× 300 W redundant', '4× 3.5" SATA + 5× 2.5" U.2/U.3 NVMe or SATA bays.')
    Q('TS-977XU-RP', 1, 505.5, 8.62, [{'count': 4, 'size': '3.5'}, {'count': 5, 'size': '2.5'}], {'rj45_1g': 2, 'sfp_plus': 2}, 76.4, None,
      '2× 300 W redundant', '4× 3.5" + 5× 2.5" SATA bays.')
    Q('TS-873AeU', 2, 297.4, 7.97, b35(8), {'rj45_2_5g': 2}, 52.5, 26.8, '250 W', 'Short-depth chassis; 2× M.2 2280 slots.')
    Q('TS-873AeU-RP', 2, 297.4, 9.2, b35(8), {'rj45_2_5g': 2}, 58.1, 32.2, '2× 300 W redundant', 'Short-depth chassis; 2× M.2 2280 slots.')
    Q('TS-864eU', 2, 297.4, 7.78, b35(8), {'rj45_2_5g': 2}, 51.0, 24.8, '300 W', 'Short-depth chassis.')
    Q('TS-855eU', 2, 297.4, 8.1, b35(8), {'rj45_2_5g': 2}, 79.1, 49.8, '250 W', 'Short-depth chassis; 2× M.2 2280 slots.')
    Q('TS-1264U-RP', 2, 370.7, 10.64, b35(12), {'rj45_2_5g': 2}, 70.9, 37.9, '2× 300 W redundant')
    Q('TS-1273AU-RP', 2, 370.7, 11.13, b35(12), {'rj45_2_5g': 2}, 78.9, 43.7, '2× 300 W redundant')
    Q('TS-h1277AXU-RP', 2, 550, 13.0, b35(12), {'rj45_2_5g': 2, 'rj45_10g': 2}, 203.3, 83.1, '2× 550 W redundant', '2× M.2 2280 PCIe Gen 5 slots.')
    Q('TS-1673AU-RP', 3, 370.9, 13.53, b35(16), {'rj45_2_5g': 2}, 97.3, 47.8, '2× 550 W redundant')
    for p in S:
        p['tags'].append('qnap')
    return S


# ---------------------------------------------------------------------------
# Switching & routing (TP-Link, Netgear, Cisco, Ubiquiti EdgeMax/UISP)
# ---------------------------------------------------------------------------

def edge():
    out = []
    def spec(slug):
        return json.load(open(f'{R}/{slug}.json'))
    def E(slug, cat, *, hu=1, depth=None, kg=None, ports=None, poe=None, notes=None, desk=None, sub='edgemax'):
        s = spec(slug)
        name = s['title'] if s['title'].startswith(('EdgeRouter', 'EdgeSwitch', 'UISP')) else s['title']
        if desk:
            w, d, h = desk
            p = desktop(f'ubiquiti-{slug}', 'Ubiquiti', s['name'], f'Ubiquiti {name}', cat, w, d, h, kg=kg, ports=ports, poe=poe,
                        accent='#006fff', body='black', url=s['url'], verified=True, notes=notes, sub=sub, legacy=sub == 'edgemax')
        else:
            p = part(f'ubiquiti-{slug}', 'Ubiquiti', s['name'], f'Ubiquiti {name}', cat, hu=hu, depth=depth, kg=kg, ports=ports, poe=poe,
                     style='switch' if cat == 'switch' else 'gateway', accent='#006fff', url=s['url'], verified=True, notes=notes,
                     sub=sub, legacy=sub == 'edgemax')
        p['tags'][0] = 'ubiquiti'
        p['tags'].append(sub)
        out.append(p)
    nopw = 'Power consumption not listed on the spec page.'
    E('es-24-250w', 'switch', depth=285, kg=4.7, ports={'rj45_1g': 24, 'sfp': 2}, poe=250, notes=nopw)
    E('es-24-500w', 'switch', depth=285, kg=4.8, ports={'rj45_1g': 24, 'sfp': 2}, notes=f'{nopw} Total PoE budget not stated (500 W PSU).')
    E('es-48-500w', 'switch', depth=375, kg=6.1, ports={'rj45_1g': 48, 'sfp_plus': 2, 'sfp': 2}, poe=500, notes=nopw)
    E('es-48-750w', 'switch', depth=375, kg=6.5, ports={'rj45_1g': 48, 'sfp_plus': 2, 'sfp': 2}, notes=f'{nopw} Total PoE budget not stated (750 W PSU).')
    E('es-16-xg', 'switch', depth=221, kg=2.7, ports={'sfp_plus': 12, 'rj45_10g': 4}, notes=f'{nopw} 56 W internal PSU.')
    E('es-16-150w', 'switch', depth=221, kg=2.9, ports={'rj45_1g': 16, 'sfp': 2}, notes=f'{nopw} 150 W internal PSU.')
    E('uisp-r-pro', 'gateway', depth=200, kg=3.3, ports={'rj45_1g': 9, 'sfp_plus': 4}, sub='uisp', notes=f'{nopw} 60 W internal PSU.')
    E('uisp-s-pro-u', 'switch', depth=268, kg=4.0, ports={'rj45_1g': 24, 'sfp_plus': 4}, poe=220, sub='uisp', notes=f'{nopw} 27 V passive PoE on 16 ports.')
    E('uisp-console-u', 'gateway', desk=(210.4, 140.2, 43.7), kg=1.5, ports={'rj45_1g': 9, 'sfp_plus': 1}, sub='uisp', notes=nopw)
    E('er-4', 'gateway', desk=(229, 136.5, 31.1), kg=0.795, ports={'rj45_1g': 3, 'sfp': 1}, notes=nopw)
    E('er-6p', 'gateway', desk=(229, 136.5, 31.1), kg=0.73, ports={'rj45_1g': 5, 'sfp': 1}, notes=f'{nopw} Rack mounting needs ER-RMKIT.')
    E('er-12p', 'gateway', desk=(268.1, 136.5, 31.1), kg=0.7, ports={'rj45_1g': 10, 'sfp': 2}, notes=nopw)
    E('er-x', 'gateway', desk=(110, 75, 22), kg=0.175, ports={'rj45_1g': 5}, notes=nopw)
    return out


def switching():
    S = edge()
    TP = '#4acbd6'
    def T(model, depth, kg, mx, ports, url, poe=None, notes=None):
        S.append(part(f'tp-link-{model.lower()}', 'TP-Link', model, f'TP-Link Omada {model}', 'switch', depth=depth, kg=kg, mx=mx, poe=poe,
                      ports=ports, style='switch', accent=TP, tags=('omada',), sub='omada', url=url, verified=True, notes=notes))
    base = 'https://static.tp-link.com/upload/product-overview/2026/202608/20260828/'
    T('SG3428', 180, 2.0, 19.8, {'rj45_1g': 24, 'sfp': 4}, base + 'SG3428(UN)%202.40_datasheet.pdf')
    T('SG3428X', 180, 2.01, 23.6, {'rj45_1g': 24, 'sfp_plus': 4}, base + 'SG3428X(UN)%201.40_datasheet.pdf')
    T('SG3428MP', 330, 5.0, 94.6, {'rj45_1g': 24, 'sfp': 4}, base + 'SG3428MP(UN)6.30_datasheet.pdf', poe=384,
      notes='Max power derived: 478.6 W at 110 V with 384 W of PoE load, minus that load.')
    T('SG3428XMP', 330, 4.99, 97.4, {'rj45_1g': 24, 'sfp_plus': 4}, base + 'SG3428XMP(UN)%203.30_datasheet.pdf', poe=384,
      notes='Max power derived: 481.4 W at 110 V with 384 W of PoE load, minus that load.')

    NG = '#5e2ca5'
    def N(model, depth, kg, ports, poe, url, notes):
        S.append(part(f'netgear-{model.lower()}', 'Netgear', model, f'Netgear {model}', 'switch', depth=depth, kg=kg, poe=poe, ports=ports,
                      style='switch', accent=NG, tags=('prosafe',), sub='smart', url=url, notes=notes))
    N('GS728TP', 257, 3.73, {'rj45_1g': 24, 'sfp': 4}, 190, 'https://www.dateks.lv/ru/cenas/komutatori/170731-netgear-gs728tp-200eus-24x1gb-poe-4xsfp',
      'Reseller figures; PoE budget quoted as 190–192 W (lower used).')
    N('GS752TP', 316, 5.1, {'rj45_1g': 48, 'sfp': 4}, 380, 'https://www.disctech.com/NetGear-GS752TP-48-Port-Smart-Switch',
      'Reseller figures; PoE budget quoted as 380–384 W (lower used). Depth 310–316 mm.')
    N('GS752TPP', 310, 5.03, {'rj45_1g': 48, 'sfp': 4}, 760, 'https://www.shi.com/product/46228255/NETGEAR-Smart-GS752TPP', 'Reseller figures.')
    S.append(part('netgear-m4250-26g4f-poe-plus', 'Netgear', 'M4250-26G4F-PoE+', 'Netgear M4250-26G4F-PoE+ (AV Line)', 'switch',
                  ports={'rj45_1g': 24, 'sfp': 4}, style='switch', accent=NG, tags=('av-line',), sub='m4250',
                  notes='Port layout from the model name; dimensions, power and PoE budget not found.'))

    CI = '#049fd9'
    def C(slug, model, depth, kg, mx, ports, poe, url, notes, sub='cbs', legacy=False):
        S.append(part(f'cisco-{slug}', 'Cisco', model, f'Cisco {model}', 'switch', depth=depth, kg=kg, mx=mx, poe=poe, ports=ports,
                      style='switch', accent=CI, tags=(sub,), sub=sub, url=url, notes=notes, legacy=legacy))
    C('cbs350-24t-4g', 'CBS350-24T-4G', 240, 2.63, 25.9, {'rj45_1g': 24, 'sfp': 4}, None, 'https://zenitel.com/product/cbs350-24t-4g-eu', 'Distributor figures.')
    C('cbs350-24t-4x', 'CBS350-24T-4X', 240, 2.78, 27.5, {'rj45_1g': 24, 'sfp_plus': 4}, None, 'https://www.zenitel.com/product/cbs350-24t-4x-eu', 'Distributor figures.')
    C('cbs350-24p-4g', 'CBS350-24P-4G', 299, 3.53, None, {'rj45_1g': 24, 'sfp': 4}, 195, 'https://www.shi.com/product/40716115/Cisco-Business-350-Series-350-24P-4G', 'Reseller figures.')
    C('cbs350-48p-4g', 'CBS350-48P-4G', 350, 5.43, 60.8, {'rj45_1g': 48, 'sfp': 4}, 370, 'https://network-switch.com/collections/cisco-cbs350-series-switches/products/network-switch-cisco-cbs350-48p-4g',
      'Reseller figures. Max power excludes PoE (452 W with PoE).')
    C('ws-c2960x-24pd-l', 'Catalyst 2960X-24PD-L', 368, 5.7, None, {'rj45_1g': 24, 'sfp_plus': 2}, 370, 'https://network-switch.com/ru/products/network-switch-cisco-catalyst-2960x-24pd-l',
      'Reseller figures.', sub='catalyst', legacy=True)
    C('ws-c2960x-48fpd-l', 'Catalyst 2960X-48FPD-L', 368, 5.8, None, {'rj45_1g': 48, 'sfp_plus': 2}, 740, 'https://www.zenitel.com/print/pdf/node/4330',
      'Distributor figures.', sub='catalyst', legacy=True)
    return S


# ---------------------------------------------------------------------------
# Power
# ---------------------------------------------------------------------------

def power():
    S = []
    S.append(part('apc-smt1500rmi2u', 'APC', 'SMT1500RMI2U', 'APC Smart-UPS 1500 VA RM 2U (230 V)', 'power', hu=2, depth=457, kg=28.64,
                  mounting='full-depth', ups={'capacityW': 1000, 'capacityVA': 1500}, ports={'outlet_c13': 4}, style='ups', accent='#00a651',
                  tags=('ups', 'smart-ups'), sub='ups', url='https://mayflex.com/shop/product/SMT1500RMI2U',
                  notes='Distributor figures; other listings give 477 mm / 26 kg for close variants.'))
    S.append(part('apc-smt1500rm2u', 'APC', 'SMT1500RM2U', 'APC Smart-UPS 1500 VA RM 2U (120 V)', 'power', hu=2, mounting='full-depth',
                  ups={'capacityW': 1000, 'capacityVA': 1440}, ports={'outlet_nema': 6}, style='ups', accent='#00a651', tags=('ups', 'smart-ups'),
                  sub='ups', url='https://www.se.com/us/en/product/SMT1500RM2U/apc-smartups-line-interactive-1440va-rackmount-2u-120v-6x-nema-515r-outlets-smartslot-avr-lcd/',
                  notes='Outlets from the APC product page; watt rating and dimensions not shown there (1000 W per APC naming convention, unconfirmed).'))
    S.append(part('apc-smt2200rm2u', 'APC', 'SMT2200RM2U', 'APC Smart-UPS 2200 VA RM 2U', 'power', hu=2, depth=683, kg=42.31, mounting='full-depth',
                  ups={'capacityW': 1980, 'capacityVA': 2200}, style='ups', accent='#00a651', tags=('ups', 'smart-ups'), sub='ups',
                  url='https://www.shi.com/product/34616886/APC-Smart-UPS-SMT2200RM2UC', notes='Figures for the SMT2200RM2UC variant (reseller).'))
    S.append(part('cyberpower-cp1500pfcrm2u', 'CyberPower', 'CP1500PFCRM2U', 'CyberPower PFC Sinewave 1500 VA 2U', 'power', hu=2, depth=267, kg=12.16,
                  ups={'capacityW': 1000, 'capacityVA': 1500}, ports={'outlet_nema': 8}, style='ups', accent='#ef7d00', tags=('ups',), sub='ups',
                  url='https://www.cyberpowersystems.com/?p=36630', notes='Short-depth 2U unit. Figures cross-checked with retailers.'))
    S.append(part('cyberpower-or500lcdrm1u', 'CyberPower', 'OR500LCDRM1U', 'CyberPower Smart App LCD 500 VA 1U', 'power', hu=1,
                  ups={'capacityW': 300, 'capacityVA': 500}, ports={'outlet_nema': 6}, style='ups', accent='#ef7d00', tags=('ups',), sub='ups',
                  notes='Capacity and outlets from a retailer listing; depth and weight not found.'))
    S.append(part('eaton-5p1500r', 'Eaton', '5P1500R', 'Eaton 5P 1500 VA Rackmount 1U', 'power', hu=1, depth=554, kg=19.7, mounting='full-depth',
                  ups={'capacityW': 1100, 'capacityVA': 1440}, ports={'outlet_nema': 5}, style='ups', accent='#005eb8', tags=('ups',), sub='ups',
                  url='https://www.shi.com/product/27032121/Eaton-5P-1500-RACKMOUNT', notes='Reseller figures.'))
    for n, outlets in ((8, 'outlet_c13'), (12, 'outlet_c13')):
        S.append(part(f'generic-pdu-1u-{n}-c13', 'Generic', f'PDU-{n}-C13', f'1U PDU {n}× C13', 'power', depth=50, mounting='rear',
                      ports={outlets: n}, style='pdu', tags=('pdu',), sub='pdu', notes='Generic item; typical dimensions.'))
    S.append(part('generic-pdu-1u-8-nema', 'Generic', 'PDU-8-NEMA', '1U power strip 8× NEMA 5-15', 'power', depth=50, mounting='rear',
                  ports={'outlet_nema': 8}, style='pdu', tags=('pdu',), sub='pdu', notes='Generic item; typical dimensions.'))
    S.append(part('generic-pdu-1u-8-schuko', 'Generic', 'PDU-8-SCHUKO', '1U power strip 8× Schuko', 'power', depth=50, mounting='rear',
                  ports={'outlet_schuko': 8}, style='pdu', tags=('pdu',), sub='pdu', notes='Generic item; typical dimensions.'))
    S.append(part('generic-pdu-1u-6-au', 'Generic', 'PDU-6-AU', '1U power strip 6× AU/NZ', 'power', depth=50, mounting='rear',
                  ports={'outlet_au': 6}, style='pdu', tags=('pdu',), sub='pdu', notes='Generic item; typical dimensions.'))
    S.append(part('generic-pdu-1u-6-uk', 'Generic', 'PDU-6-UK', '1U power strip 6× UK', 'power', depth=50, mounting='rear',
                  ports={'outlet_uk': 6}, style='pdu', tags=('pdu',), sub='pdu', notes='Generic item; typical dimensions.'))
    return S


# ---------------------------------------------------------------------------
# Passive 19" gear
# ---------------------------------------------------------------------------

def passive():
    g = 'Generic item; typical dimensions.'
    S = []
    def P(id, model, name, category, style, hu=1, depth=None, ports=None, sub=None, mounting='front', shelf=None, tags=(), notes=g):
        S.append(part(id, 'Generic', model, name, category, hu=hu, depth=depth, ports=ports, style=style, sub=sub, mounting=mounting,
                      shelf=shelf, tags=('passive', *tags), notes=notes))
    P('generic-patch-24-cat6-keystone-1u', 'PP-24-C6-KS', '24-port Cat6 keystone patch panel 1U', 'patch-panel', 'patch-panel', depth=40, ports={'keystone': 24}, sub='keystone', tags=('cat6',))
    P('generic-patch-24-cat6a-keystone-1u', 'PP-24-C6A-KS', '24-port Cat6A keystone patch panel 1U', 'patch-panel', 'patch-panel', depth=40, ports={'keystone': 24}, sub='keystone', tags=('cat6a',))
    P('generic-patch-24-cat6-punch-1u', 'PP-24-C6-PD', '24-port Cat6 punch-down patch panel 1U', 'patch-panel', 'patch-panel', depth=100, ports={'keystone': 24}, sub='punch-down', tags=('cat6',))
    P('generic-patch-24-cat6-angled-1u', 'PP-24-C6-ANG', '24-port Cat6 angled patch panel 1U', 'patch-panel', 'patch-panel', depth=60, ports={'keystone': 24}, sub='angled', tags=('cat6',))
    P('generic-patch-12-cat6-1u', 'PP-12-C6', '12-port Cat6 patch panel 1U', 'patch-panel', 'patch-panel', depth=40, ports={'keystone': 12}, sub='keystone', tags=('cat6',))
    P('generic-patch-16-cat6-1u', 'PP-16-C6', '16-port Cat6 patch panel 1U', 'patch-panel', 'patch-panel', depth=40, ports={'keystone': 16}, sub='keystone', tags=('cat6',))
    P('generic-patch-48-cat6-1u-hd', 'PP-48-C6-HD', '48-port Cat6 high-density patch panel 1U', 'patch-panel', 'patch-panel', depth=100, ports={'keystone': 48}, sub='punch-down', tags=('cat6',))
    P('generic-patch-48-cat6-2u', 'PP-48-C6', '48-port Cat6 patch panel 2U', 'patch-panel', 'patch-panel', hu=2, depth=100, ports={'keystone': 48}, sub='punch-down', tags=('cat6',))
    P('generic-patch-24-cat6-half-u', 'PP-24-C6-05U', '24-port Cat6 patch panel 0.5U', 'patch-panel', 'patch-panel', hu=0.5, depth=40, ports={'keystone': 24}, sub='keystone', tags=('cat6', '0.5u'))
    P('generic-fibre-panel-24-lc-1u', 'FP-24-LC', 'Fibre patch panel 24× LC duplex 1U', 'patch-panel', 'patch-panel', depth=250, ports={'lc_duplex': 24}, sub='fibre', tags=('fibre',))
    P('generic-fibre-panel-12-lc-1u', 'FP-12-LC', 'Fibre patch panel 12× LC duplex 1U', 'patch-panel', 'patch-panel', depth=250, ports={'lc_duplex': 12}, sub='fibre', tags=('fibre',))
    P('generic-blank-1u-19', 'BLANK-1U', 'Blank panel 1U', 'blank', 'blank', depth=5)
    P('generic-blank-2u-19', 'BLANK-2U', 'Blank panel 2U', 'blank', 'blank', hu=2, depth=5)
    P('generic-vented-blank-1u-19', 'VENT-1U', 'Vented blank panel 1U', 'blank', 'vented', depth=5, tags=('vented',))
    P('generic-vented-blank-2u-19', 'VENT-2U', 'Vented blank panel 2U', 'blank', 'vented', hu=2, depth=5, tags=('vented',))
    P('generic-brush-1u-19', 'BRUSH-1U', 'Brush panel 1U', 'cable-management', 'brush', depth=30, sub='brush')
    P('generic-brush-2u-19', 'BRUSH-2U', 'Brush panel 2U', 'cable-management', 'brush', hu=2, depth=30, sub='brush')
    P('generic-cable-manager-1u-19', 'CM-1U-DRING', 'Horizontal cable manager 1U (D-ring)', 'cable-management', 'cable-manager', depth=60, sub='horizontal')
    P('generic-cable-manager-2u-19', 'CM-2U-DRING', 'Horizontal cable manager 2U (D-ring)', 'cable-management', 'cable-manager', hu=2, depth=80, sub='horizontal')
    P('generic-cable-manager-1u-finger', 'CM-1U-FINGER', 'Finger duct cable manager 1U', 'cable-management', 'cable-manager', depth=60, sub='horizontal')
    P('generic-shelf-1u-vented-19', 'SHELF-1U-250', 'Vented cantilever shelf 1U (250 mm)', 'shelf', 'shelf', depth=250, sub='cantilever', tags=('shelf',),
      shelf={'usableWidthMm': 430, 'usableDepthMm': 250})
    P('generic-shelf-1u-350-19', 'SHELF-1U-350', 'Vented cantilever shelf 1U (350 mm)', 'shelf', 'shelf', depth=350, sub='cantilever', tags=('shelf',),
      shelf={'usableWidthMm': 430, 'usableDepthMm': 350})
    P('generic-shelf-2u-400-19', 'SHELF-2U-400', 'Cantilever shelf 2U (400 mm)', 'shelf', 'shelf', hu=2, depth=400, sub='cantilever', tags=('shelf',),
      shelf={'usableWidthMm': 430, 'usableDepthMm': 400})
    P('generic-shelf-1u-sliding-19', 'SHELF-1U-SLIDE', 'Sliding shelf 1U (4-post)', 'shelf', 'shelf', depth=500, mounting='full-depth', sub='sliding', tags=('shelf',),
      shelf={'usableWidthMm': 430, 'usableDepthMm': 480})
    P('generic-shelf-1u-fixed-4post-19', 'SHELF-1U-4P', 'Fixed shelf 1U (4-post, adjustable)', 'shelf', 'shelf', depth=550, mounting='full-depth', sub='4-post', tags=('shelf',),
      shelf={'usableWidthMm': 430, 'usableDepthMm': 530})
    P('generic-drawer-2u-19', 'DRAWER-2U', 'Rack drawer 2U', 'accessory', 'drawer', hu=2, depth=350, sub='drawer')
    P('generic-drawer-3u-19', 'DRAWER-3U', 'Rack drawer 3U', 'accessory', 'drawer', hu=3, depth=350, sub='drawer')
    P('generic-fan-tray-1u-19', 'FAN-1U', 'Fan tray 1U (4 fans)', 'accessory', 'fan', depth=300, mounting='full-depth', sub='cooling')
    S[-1]['power']['maxW'] = None
    return S


# ---------------------------------------------------------------------------
# 10-inch mini-rack ecosystem
# ---------------------------------------------------------------------------

def mini_rack():
    g = 'Generic 10" item; typical dimensions.'
    dp = 'https://thepihut.com/collections/deskpi-rackmate-and-accessories'
    S = []
    def M(id, brand, model, name, category, style, hu=1, depth=None, ports=None, sub=None, mounting='front', shelf=None, rack=('10in',),
          width='10in', tags=(), notes=g, url=None, accent=None):
        S.append(part(id, brand, model, name, category, hu=hu, width=width, depth=depth, ports=ports, style=style, sub=sub, mounting=mounting,
                      shelf=shelf, rack=rack, tags=('10in', *tags), notes=notes, url=url, accent=accent))
    M('deskpi-rackmate-shelf-1u', 'DeskPi', 'RackMate 1U Rack Shelf', 'DeskPi RackMate 10" 1U shelf', 'shelf', 'shelf', depth=200, sub='shelf', tags=('shelf', 'deskpi'),
      shelf={'usableWidthMm': 210, 'usableDepthMm': 195}, url='https://thepihut.com/products/1u-10-rack-shelf-for-deskpi-rackmate',
      notes='Depth assumed to match the RackMate frame (200 mm).')
    M('deskpi-rackmate-shelf-half-u', 'DeskPi', 'RackMate 0.5U Rack Shelf', 'DeskPi RackMate 10" 0.5U shelf', 'shelf', 'shelf', hu=0.5, depth=200, sub='shelf', tags=('shelf', 'deskpi'),
      shelf={'usableWidthMm': 210, 'usableDepthMm': 195}, url='https://thepihut.com/products/0-5u-10-rack-shelf-for-deskpi-rackmate', notes='214 × 200 × 21 mm per retailer.')
    M('deskpi-rackmate-itx-shelf-1u', 'DeskPi', 'RackMate 1U Mini ITX Shelf', 'DeskPi RackMate 10" 1U Mini-ITX shelf', 'shelf', 'shelf', depth=200, sub='shelf',
      tags=('shelf', 'deskpi'), shelf={'usableWidthMm': 210, 'usableDepthMm': 195}, url='https://thepihut.com/products/1u-10-mini-itx-shelf-for-deskpi-rackmate',
      notes='214 × 200 × 41.2 mm per retailer.')
    M('deskpi-rackmate-sbc-shelf-1u', 'DeskPi', 'RackMate 1U SBC Shelf', 'DeskPi RackMate 10" 1U SBC shelf (Raspberry Pi)', 'mount', 'server', depth=200, sub='sbc',
      tags=('raspberry-pi', 'deskpi'), url='https://thepihut.com/products/1u-10-sbc-shelf-for-deskpi-rackmate', accent='#c51a4a',
      notes='Ventilated tray with standoffs for Raspberry Pi boards and 2.5" drives. Depth assumed (200 mm frame).')
    M('deskpi-rackmate-blank-1u', 'DeskPi', 'RackMate 1U Blank Panel', 'DeskPi RackMate 10" 1U blank panel', 'blank', 'blank', depth=5, tags=('deskpi', 'passive'),
      url='https://thepihut.com/collections/project-enclosures/products/1u-10-blank-panel-for-deskpi-rackmate', notes='Metal blank panel.')
    M('deskpi-rackmate-patch-12-half-u', 'DeskPi', 'RackMate 0.5U 12-port Cat6 Patch Panel', 'DeskPi 10" 0.5U 12-port Cat6 patch panel', 'patch-panel', 'patch-panel',
      hu=0.5, depth=40, ports={'keystone': 12}, sub='keystone', tags=('deskpi', 'cat6', 'passive'), url=dp, notes='Depth assumed.')
    M('generic-patch-12-cat6-10in', 'Generic', 'PP-12-C6-10', '10" 12-port Cat6 patch panel 1U', 'patch-panel', 'patch-panel', depth=40, ports={'keystone': 12}, sub='keystone', tags=('passive', 'cat6'))
    M('generic-patch-8-cat6-10in', 'Generic', 'PP-8-C6-10', '10" 8-port Cat6 patch panel 1U', 'patch-panel', 'patch-panel', depth=40, ports={'keystone': 8}, sub='keystone', tags=('passive', 'cat6'))
    M('generic-blank-1u-10in', 'Generic', 'BLANK-1U-10', '10" blank panel 1U', 'blank', 'blank', depth=5, tags=('passive',))
    M('generic-blank-2u-10in', 'Generic', 'BLANK-2U-10', '10" blank panel 2U', 'blank', 'blank', hu=2, depth=5, tags=('passive',))
    M('generic-vented-1u-10in', 'Generic', 'VENT-1U-10', '10" vented panel 1U', 'blank', 'vented', depth=5, tags=('passive',))
    M('generic-brush-1u-10in', 'Generic', 'BRUSH-1U-10', '10" brush panel 1U', 'cable-management', 'brush', depth=30, tags=('passive',))
    M('generic-shelf-1u-10in', 'Generic', 'SHELF-1U-10', '10" shelf 1U', 'shelf', 'shelf', depth=200, sub='shelf', tags=('shelf',), shelf={'usableWidthMm': 210, 'usableDepthMm': 195})
    M('generic-shelf-2u-10in', 'Generic', 'SHELF-2U-10', '10" shelf 2U (lipped)', 'shelf', 'shelf', hu=2, depth=200, sub='shelf', tags=('shelf',), shelf={'usableWidthMm': 210, 'usableDepthMm': 195})
    M('generic-pi-mount-1u-10in', 'Generic', 'PI-1U-4', '10" Raspberry Pi mount (4× Pi) 1U', 'mount', 'server', depth=100, ports={'rj45_1g': 4}, sub='sbc',
      rack=('10in', '19in'), tags=('raspberry-pi',), accent='#c51a4a', notes='Also fits a 19" rack as a partial-width panel (with adapter ears). ' + g)
    M('generic-mini-pc-mount-1u-10in', 'Generic', 'MINIPC-1U-10', '10" 1U mini-PC mount (Lenovo Tiny / HP Mini / Dell Micro)', 'mount', 'server', depth=200, sub='mini-pc',
      notes='Front-facing bracket for one 1L business mini PC. ' + g)
    M('generic-mac-mini-mount-2u-10in', 'Generic', 'MACMINI-2U-10', '10" 2U Mac mini mount', 'mount', 'server', hu=2, depth=200, sub='mini-pc', notes=g)
    M('generic-nuc-mount-1u-10in', 'Generic', 'NUC-1U-10', '10" 1U Intel NUC mount', 'mount', 'server', depth=150, sub='mini-pc', notes=g)
    M('generic-switch-8p-10in', 'Generic', 'SW-8-10', '10" 8-port gigabit switch 1U', 'switch', 'switch', depth=120, ports={'rj45_1g': 8}, rack=('10in', '19in'), accent='#22c55e')
    M('generic-pdu-10in-4', 'Generic', 'PDU-10-4', '10" PDU 4× C13 1U', 'power', 'pdu', depth=50, mounting='rear', ports={'outlet_c13': 4}, sub='pdu')
    M('generic-pdu-10in-3-nema', 'Generic', 'PDU-10-3-NEMA', '10" power strip 3× NEMA 1U', 'power', 'pdu', depth=50, mounting='rear', ports={'outlet_nema': 3}, sub='pdu')
    M('generic-fan-1u-10in', 'Generic', 'FAN-1U-10', '10" fan panel 1U (2 fans)', 'accessory', 'fan', depth=40, sub='cooling')
    M('generic-half19-to-10in-adapter', 'Generic', 'ADAPT-10-19', '10" device adapter for 19" racks (1U, half width)', 'mount', 'blank', width='half-19in',
      rack=('19in',), depth=10, tags=('adapter',), notes='Placeholder for mounting 10" gear in a 19" rack: occupies half the width. ' + g)
    S[-1]['tags'].remove('10in')
    return S


# ---------------------------------------------------------------------------
# Desktop gear that sits on shelves
# ---------------------------------------------------------------------------

def desktop_gear():
    S = []
    def DK(id, brand, model, name, cat, w, d, h, kg=None, url=None, notes=None, ports=None, accent=None, body='grey', mx=None, typ=None):
        S.append(desktop(id, brand, model, name, cat, w, d, h, kg=kg, url=url, ports=ports, accent=accent, body=body, mx=mx, typ=typ,
                         notes=notes or 'Dimensions from memory/common listings; check before relying on them.'))
    DK('lenovo-thinkcentre-m920q', 'Lenovo', 'ThinkCentre M920q Tiny', 'Lenovo ThinkCentre M920q Tiny', 'mini-pc', 179, 182.9, 34.5, kg=1.32,
       url='https://www.shi.com/product/35698554/Lenovo-ThinkCentre-M920q-10RS', notes='Reseller spec sheet.', ports={'rj45_1g': 1, 'usb': 6}, body='black')
    DK('lenovo-thinkcentre-m720q', 'Lenovo', 'ThinkCentre M720q Tiny', 'Lenovo ThinkCentre M720q Tiny', 'mini-pc', 179, 182.9, 34.5,
       notes='Same 1L "Tiny" chassis as the M920q; weight not confirmed.', ports={'rj45_1g': 1, 'usb': 6}, body='black')
    DK('hp-elitedesk-800-g4-mini', 'HP', 'EliteDesk 800 G4 Mini', 'HP EliteDesk 800 G4 Mini', 'mini-pc', 177, 175, 34, ports={'rj45_1g': 1, 'usb': 5}, body='black')
    DK('dell-optiplex-7060-micro', 'Dell', 'OptiPlex 7060 Micro', 'Dell OptiPlex 7060 Micro', 'mini-pc', 182, 178, 36, ports={'rj45_1g': 1, 'usb': 6}, body='black')
    DK('intel-nuc-13-pro-tall', 'Intel', 'NUC 13 Pro (tall)', 'Intel NUC 13 Pro (tall chassis)', 'mini-pc', 117, 112, 54, ports={'rj45_2_5g': 1, 'usb': 4})
    DK('intel-nuc-13-pro-slim', 'Intel', 'NUC 13 Pro (slim)', 'Intel NUC 13 Pro (slim chassis)', 'mini-pc', 117, 112, 37, ports={'rj45_2_5g': 1, 'usb': 4})
    DK('apple-mac-mini-m4', 'Apple', 'Mac mini (M4)', 'Mac mini (M4, 2024)', 'mini-pc', 127, 127, 50, kg=0.67, ports={'rj45_1g': 1, 'usb': 5}, body='silver')
    DK('apple-mac-mini-m2', 'Apple', 'Mac mini (M2)', 'Mac mini (M2, 2023)', 'mini-pc', 197, 197, 35.8, kg=1.18, ports={'rj45_1g': 1, 'usb': 4}, body='silver')
    DK('raspberry-pi-5-case', 'Raspberry Pi', 'Raspberry Pi 5 (official case)', 'Raspberry Pi 5 in official case', 'sbc', 95, 63, 30, ports={'rj45_1g': 1, 'usb': 4},
       accent='#c51a4a', body='white', notes='Board is 85 × 56 mm; case size approximate.')
    pi = 'https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-product-brief.pdf'
    DK('raspberry-pi-4-model-b', 'Raspberry Pi', 'Raspberry Pi 4 Model B', 'Raspberry Pi 4 Model B (bare board)', 'sbc', 85, 56, 20, url=pi,
       ports={'rj45_1g': 1, 'usb': 4}, mx=15.0, accent='#c51a4a', body='black',
       notes='Ports and 5 V / 3 A supply from the official product brief; max W is the supply rating, not measured draw. 85 × 56 mm board, height approximate. Use measured power for real figures.')
    DK('raspberry-pi-4-case', 'Raspberry Pi', 'Raspberry Pi 4 Model B (official case)', 'Raspberry Pi 4 Model B in official case', 'sbc', 90, 60, 30, url=pi,
       ports={'rj45_1g': 1, 'usb': 4}, mx=15.0, accent='#c51a4a', body='white',
       notes='Case size 90 × 60 × 30 mm per retailers (some list 97 × 70 × 25 mm). Max W is the 5 V / 3 A supply rating.')
    DK('generic-fibre-ont', 'Generic', 'ONT', 'Fibre ONT / NTD', 'modem', 150, 110, 35, ports={'rj45_1g': 1}, body='white', notes='Generic ISP fibre terminal; typical size.')
    DK('generic-cable-modem', 'Generic', 'MODEM', 'Cable / DSL modem', 'modem', 180, 180, 45, ports={'rj45_1g': 1}, body='white', notes='Generic ISP modem; typical size.')
    DK('generic-desktop-switch-8', 'Generic', 'DSW-8', 'Unmanaged 8-port desktop switch', 'switch', 160, 100, 27, ports={'rj45_1g': 8}, notes='Generic desktop switch; typical size.')
    DK('generic-2-5-inch-ssd', 'Generic', 'USB-SSD', 'External USB drive', 'storage', 80, 120, 20, notes='Generic external drive; typical size.')
    return S


def ugreen():
    S = []
    UG = '#2b7de9'
    def UGN(slug, model, w, d, h, bays, ports, url, notes, kg=None, typ=None):
        p = desktop(f'ugreen-{slug}', 'UGREEN', model, f'UGREEN NASync {model}', 'nas', w, d, h, kg=kg, typ=typ, bays=bays, ports=ports,
                    accent=UG, body='grey', url=url, sub='nasync', notes=notes)
        p['tags'].append('nasync')
        S.append(p)
    b = lambda n, size='3.5': [{'count': n, 'size': size}]
    UGN('dxp2800', 'DXP2800', 109, 237, 177, b(2), {'rj45_2_5g': 1}, 'https://www.alza.hu/EN/ugreen-us-dxp2800-d12923173.htm',
        'Dimensions from a retailer; 2× M.2 slots not drawn. Ships with a 12 V / 5 A adapter. Weight not confirmed.')
    UGN('dxp4800-plus', 'DXP4800 Plus', 178, 258, 178, b(4), {'rj45_10g': 1, 'rj45_2_5g': 1}, 'https://www.canadacomputers.com/en/281270/ugreen-dxp4800-plus-4-bay-nas-diskless-dxp4800-plus.html',
        'Retailer figures. Typical power is the ~42 W "access" figure quoted by retailers; 150 W external adapter. Weight quoted 6–7.9 kg, so left blank.', typ=42.4)
    UGN('dxp6800-pro', 'DXP6800 Pro', 258, 293, 200, b(6), {'rj45_10g': 2}, 'https://uk.ugreen.com/products/ugreen-6-bay-nas-storage-160tb',
        'Dimensions from UGREEN UK store (11.54 × 10.16 × 7.87 in); orientation assumed (6 bays across the front).')
    UGN('dxp8800-plus', 'DXP8800 Plus', 258, 360, 200, b(8), {'rj45_10g': 2}, 'https://www.multitronic.fi/en/products/4583351',
        'Retailer figures (another lists 365 × 258 × 189 mm). Typical power is a retailer-quoted 70 W.', kg=7.42, typ=70.4)
    UGN('dxp480t-plus', 'DXP480T Plus', 142, 178, 52, b(4, 'm2'), {'rj45_10g': 1}, 'https://www.ocinside.de/review/ugreen_dxp480t_plus/2/',
        'All-flash: 4× M.2 NVMe. Weight is ~0.9 kg with SSDs (review figure).', kg=0.9)
    UGN('dh4300-plus', 'DH4300 Plus', 155, 155, 215.7, b(4), {}, 'https://www.alza.de/EN/ugreen-nas-dh4300-plus-d13172549.htm',
        'Dimensions from a retailer; port layout not confirmed.')
    UGN('dh2300', 'DH2300', 98, 151, 213.7, b(2), {}, 'https://www.alza.hu/EN/ugreen-us-dh2300-d13172548.htm',
        'Dimensions from retailers; port layout not confirmed.')
    return S


def main():
    write('servers.json', 'Servers & chassis',
          'Dell PowerEdge, HPE ProLiant, Supermicro chassis and generic DIY cases. Figures from rack-vendor guides and resellers (Dell/HPE spec pages for these older models are hard to reach), so all are verified: false. Server power is left blank because it depends on configuration.',
          servers(), 2)
    write('storage.json', 'Rack NAS & storage',
          'Synology RackStation and QNAP rack NAS. Specs from synology.com and qnap.com spec pages (fetched 2026-11-02); typical power is the vendor\'s access/operating figure with drives installed.',
          storage() + qnap(), 2)
    write('switching.json', 'Other switching & routing',
          'TP-Link Omada (official datasheets), Netgear and Cisco (reseller/distributor figures), and legacy Ubiquiti EdgeMax/UISP gear (techspecs.ui.com).',
          switching(), 2)
    write('power.json', 'Power: UPS & PDU', 'Rack UPS units from APC, CyberPower and Eaton, plus generic rack PDUs and power strips.', power(), 2)
    write('patch-panels.json', 'Patch panels, blanks & passive 19"', 'Generic passive rack gear with typical dimensions.', passive(), 2)
    write('mini-rack.json', '10-inch mini-rack', 'DeskPi RackMate accessories and generic 10" panels, shelves, mounts and PDUs.', mini_rack(), 2)
    write('desktop.json', 'Desktop gear (shelf-mounted)', 'Mini PCs, SBCs, desktop NAS (UGREEN NASync), modems and other devices that sit on a rack shelf.', desktop_gear() + ugreen(), 2)


if __name__ == '__main__':
    main()
