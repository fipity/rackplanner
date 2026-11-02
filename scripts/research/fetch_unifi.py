import json, re, sys, time, urllib.request, os
R = os.path.expanduser('~/.cache/rackplanner-research')
def fetch(cat, slug):
    out = f'{R}/unifi/{slug}.json'
    if os.path.exists(out): return
    url = f'https://techspecs.ui.com/{cat}/{slug}' if '/' in cat else f'https://techspecs.ui.com/unifi/{cat}/{slug}'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    h = urllib.request.urlopen(req, timeout=30).read().decode()
    d = json.loads(re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', h, re.S).group(1))
    p = d['props']['pageProps']['product']
    feats = {}
    groups = {}
    for s in (p.get('technicalSpecification') or {}).get('sections', []):
        for f in s['features']:
            fe = f['feature']
            if f['__typename'].endswith('Group'):
                groups[fe['id']] = fe['label']; continue
            label = fe['label']
            if fe.get('parentId') in groups: label = groups[fe['parentId']] + ' / ' + label
            val = f.get('value') if 'value' in f else f.get('flag')
            if f.get('note'): val = f'{val} [{f["note"]}]'
            feats[label] = val
    if not feats:
        # Legacy (EdgeMax/UISP) pages embed an HTML key/value table instead.
        blob = json.dumps(p)
        for m in re.finditer(r'"html": "(<table class=\\"data-table.*?</table>)"', blob):
            html = json.loads('"' + m.group(1) + '"')
            for k, v in re.findall(r'<td class="key">(.*?)</td><td class="value">(.*?)</td>', html, re.S):
                k = re.sub(r'<[^>]+>', '', k).strip()
                v = re.sub(r'<br\s*/?>', '\n', v)
                feats.setdefault(k, re.sub(r'<[^>]+>', '', v).strip())
    rec = {'slug': slug, 'cat': cat, 'url': url, 'name': p.get('name'), 'title': p.get('title'),
           'short': p.get('shortDescription'), 'specs': feats}
    json.dump(rec, open(out, 'w'), indent=1)
for line in open(os.path.join(os.path.dirname(__file__), 'unifi-slugs.txt')):
    cat, slug = line.split()
    try:
        fetch(cat, slug); time.sleep(0.3)
    except Exception as e:
        print('FAIL', slug, e)
print('done', len(os.listdir(f'{R}/unifi')))
