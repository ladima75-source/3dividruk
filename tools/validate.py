"""Validate imported data, assets, generated routes, and no-cross-store boundaries."""
import json
import re
from pathlib import Path
from urllib.parse import urlparse, unquote
from html.parser import HTMLParser

ROOT=Path(__file__).resolve().parents[1]
errors=[]
def check(ok,message):
    if not ok:errors.append(message)

class Links(HTMLParser):
    def __init__(self):super().__init__();self.refs=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs)
        for key in ('src','href'):
            if a.get(key):self.refs.append(a[key])

raw=json.loads((ROOT/'data/catalog.json').read_text(encoding='utf-8-sig'));products=raw['products'] if isinstance(raw,dict) else raw
ids=set();skus=set();commerce_skus=set();images=set()
for p in products:
    check(p['id'] not in ids,'Duplicate id '+p['id']);ids.add(p['id'])
    if p.get('sku'):
        skus.add(p['sku'])
    commerce_sku=p.get('commerceSku') or p.get('sku') or ('PROM-'+p['id'])
    check(commerce_sku not in commerce_skus,'Duplicate commerce identity '+commerce_sku);commerce_skus.add(commerce_sku)
    check(bool(p['title']),'Empty title '+p['id'])
    check(p.get('price') is None or isinstance(p['price'],(int,float)) and p['price']>0,'Invalid price '+p['id'])
    check(p['availability'] in ('in_stock','out_of_stock','preorder','unknown'),'Invalid availability '+p['id'])
    check(urlparse(p['sourceUrl']).hostname=='3dividruk.com.ua','Unexpected source '+p['id'])
    check((ROOT/'products'/p['id']/'index.html').is_file(),'Missing product page '+p['id'])
    for image in p['images']:
        images.add(image)
        if not urlparse(image).scheme:check((ROOT/image).is_file(),'Missing photo '+image)
for file in ROOT.rglob('*.html'):
    parser=Links();text=file.read_text(encoding='utf-8');parser.feed(text)
    for ref in parser.refs:
        if urlparse(ref).scheme or ref.startswith(('#','//')):continue
        target=(file.parent/unquote(ref.split('?')[0].split('#')[0])).resolve()
        if target.is_dir():target=target/'index.html'
        check(target.is_file(),f'Broken asset/link {file.relative_to(ROOT)} -> {ref}')
    if 'admin' not in file.relative_to(ROOT).parts:check('noindex' in text,'Preview accidentally indexable '+str(file))
for folder in ('js','config','css','admin'):
    for file in (ROOT/folder).rglob('*'):
        if not file.is_file() or file.suffix not in ('.js','.css','.html','.json'):continue
        text=file.read_text(encoding='utf-8')
        check(not re.search(r'https?://(?:api\.)?(?:market\.)?bb610\.com\.ua',text),f'BB610 production origin in {file.relative_to(ROOT)}')
        check(not re.search(r'GTM-[A-Z0-9]+|G-[A-Z0-9]{8,}|AW-\d+',text),f'Old analytics id {file.relative_to(ROOT)}')
check(not (ROOT/'CNAME').exists(),'Never transfer original CNAME')
check(not (ROOT/'.github/workflows').exists(),'Unreviewed source workflows must not run')
check('checkoutMode: \'preview\'' in (ROOT/'config/runtime.js').read_text(),'Static checkout must stay preview')
if errors:
    print('\n'.join(errors));raise SystemExit(1)
print(f'Passed: {len(products)} product pages, {len(skus)} unique nonempty SKUs, {len(images)} image references; links, noindex, independent origins, payment preview lock.')
