#!/usr/bin/env python3
"""Fill in catalog airflow for common rack gear (one-off, 2026-11-27).

Verified values cite a maker source in the part's notes. Everything else is a
best guess marked `airflowVerified: false` (rack NAS / NVRs: drive bays at the
front, fans pulling air through to the back; fanless switches and routers:
passive). Parts whose fan direction we couldn't establish are left unset
(unknown), never guessed.
"""
import glob, json, os
CAT = os.path.join(os.path.dirname(__file__), '..', '..', 'catalog')

VERIFIED = {
    'mikrotik-crs326-24g-2s-rm': ('passive', 'Airflow: passive (no fans), per MikroTik\'s product comparison ("Cooling type: Passive").'),
    'cisco-cbs350-24t-4g': ('passive', 'Airflow: fanless, per the fan table in Cisco\'s CBS350 data sheet.'),
}
GUESS_PASSIVE = {
    'mikrotik-css326-24g-2s-rm', 'mikrotik-rb4011igs-rm', 'mikrotik-l009uigs-rm',
    'tp-link-sg3428', 'ubiquiti-usw-24', 'ubiquiti-usw-aggregation',
    # Cisco's data sheet table says fanless; a reseller says it has a fan.
    'cisco-cbs350-24p-4g',
}
GUESS_FRONT_TO_BACK_CATEGORIES = {'nas', 'nvr'}

changed = 0
for f in sorted(glob.glob(os.path.join(CAT, '*.json'))):
    if f.endswith('schema.json'):
        continue
    data = json.load(open(f))
    touched = False
    for p in data['parts']:
        if p.get('airflow'):
            continue
        val = verified = None
        if p['id'] in VERIFIED:
            val, note = VERIFIED[p['id']]
            verified = True
            if note not in (p.get('notes') or ''):
                p['notes'] = ((p.get('notes') or '') + ' ' + note).strip()
        elif p['id'] in GUESS_PASSIVE:
            val, verified = 'passive', False
        elif p.get('formFactor', 'rack') == 'rack' and p['category'] in GUESS_FRONT_TO_BACK_CATEGORIES:
            val, verified = 'front-to-back', False
        if not val:
            continue
        # Keep key order tidy: airflow goes just before tags.
        items = list(p.items())
        idx = next((i for i, (k, _) in enumerate(items) if k == 'tags'), len(items))
        items[idx:idx] = [('airflow', val), ('airflowVerified', verified)]
        p.clear()
        p.update(items)
        touched = True
        changed += 1
    if touched:
        data['version'] += 1
        open(f, 'w').write(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
print(f'airflow filled for {changed} parts')
