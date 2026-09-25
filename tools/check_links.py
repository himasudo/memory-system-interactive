#!/usr/bin/env python3
"""Check every "Learn more" URL in src/02_sources.js. Run from the repo root: python3 tools/check_links.py"""
import re, urllib.request, concurrent.futures as cf
js = open('src/02_sources.js', encoding='utf-8').read()
urls = set(re.findall(r"'(https://[^']+)'", js))
urls |= {'https://en.wikipedia.org/wiki/' + t for t in re.findall(r"W\('([^']+?)'", js) if 'Tomasulo' not in t}
urls |= {'https://en.wikipedia.org/wiki/Tomasulo%27s_algorithm'}
urls |= {'https://www.felixcloutier.com/x86/' + i for i in re.findall(r"S\.fc\('([a-z]+)'\)", js)}
urls.discard('https://www.felixcloutier.com/x86/')
def check(u):
    req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0 (link-check)'})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: return u, r.status
    except Exception as e: return u, getattr(e, 'code', None) or type(e).__name__
with cf.ThreadPoolExecutor(10) as ex: res = sorted(ex.map(check, sorted(urls)), key=lambda x: str(x[1]))
bad = [(u, c) for u, c in res if c != 200]
print(f'{len(res)} URLs checked, {len(res) - len(bad)} OK')
for u, c in bad: print(f'  {c}  {u}')
