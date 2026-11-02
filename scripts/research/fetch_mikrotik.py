#!/usr/bin/env python3
"""Fetch MikroTik product spec lists (label/value pairs) into ~/.cache/rackplanner-research/mikrotik/."""
import json, os, re, time, urllib.request
R = os.path.expanduser('~/.cache/rackplanner-research/mikrotik')
os.makedirs(R, exist_ok=True)
SLUGS = '''CRS326-24G-2SplusRM crs328_24p_4s_rm crs317_1g_16s_rm crs312_4c_8xg_rm crs326_24s_2q_rm crs326_4c_20g_2q_rm
crs328_4c_20s_4s_rm crs354_48g_4splus2qplusrm crs354_48p_4s_2q_rm crs418_8p_8g_2s_rm crs320_8p_8b_4s_rm crs518_16xs_2xq
crs520_4xs_16xq_rm crs309_1g_8s_in crs305_1g_4s_in crs310_8g_2s_in crs310_1g_5s_4s_in crs504_4xq_in crs510_8xs_2xq_in
CSS326-24G-2SplusRM css610_8g_2s_in ccr2004_16g_2splus ccr2004_1g_12s_2xs ccr2116_12g_4splus ccr2216_1g_12xs_2xq
rb4011igs_rm rb5009ug_s_in RB1100Dx4 l009uigs_rm rds2216'''.split()
clean = lambda s: re.sub(r'\s+', ' ', re.sub(r'<!--.*?-->|<[^>]+>', ' ', s, flags=re.S)).strip()
for slug in SLUGS:
    out = f'{R}/{slug}.json'
    if os.path.exists(out):
        continue
    url = f'https://mikrotik.com/product/{slug}'
    try:
        h = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read().decode()
    except Exception as e:
        print('FAIL', slug, e); continue
    specs = {}
    for k, v in re.findall(r'<span class="basis-1/2 font-bold">(.*?)</span>\s*<span class="basis-1/2 font-light[^"]*">(.*?)</span>', h, re.S):
        k, v = clean(k), clean(v)
        if k and k not in specs:
            specs[k] = v
    title = clean(re.search(r'<title>(.*?)</title>', h, re.S).group(1)) if '<title>' in h else slug
    json.dump({'slug': slug, 'url': url, 'title': title, 'specs': specs}, open(out, 'w'), indent=1)
    time.sleep(0.4)
print('done', len(os.listdir(R)))
