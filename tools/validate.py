"""Validate imported data, assets, generated routes, and no-cross-store boundaries."""
import json
import csv
import re
from pathlib import Path
from urllib.parse import urlparse, unquote
from html.parser import HTMLParser

ROOT=Path(__file__).resolve().parents[1]
SITE='https://ladima75-source.github.io/3dividruk/'
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
    relative=file.relative_to(ROOT).as_posix()
    if len(file.relative_to(ROOT).parts)==1 and file.name!='product.html':
        expected=SITE if file.name=='index.html' else SITE+file.name
        canonical=re.search(r'<link rel="canonical" href="([^"]+)"',text)
        check(canonical is not None and canonical.group(1)==expected,f'Wrong canonical {relative}: expected {expected}')
# Paused collections stay in the master catalog but must not be exposed to shoppers or feeds.
visibility=json.loads((ROOT/'config/storefront-visibility.json').read_text(encoding='utf-8'))
paused_categories=set(visibility.get('paused_categories',[]))
paused_ids=set(visibility.get('paused_product_ids',[]))
paused=[p for p in products if p['category'] in paused_categories or p['id'] in paused_ids]
for p in products:
    check(p.get('storefront_visible',True) == (p not in paused),'Visibility mismatch '+p['id'])
sitemap=(ROOT/'sitemap.xml').read_text(encoding='utf-8')
for p in paused:
    check(SITE+'products/'+p['id']+'/' not in sitemap,'Paused product in sitemap '+p['id'])
    page=(ROOT/'products'/p['id']/'index.html').read_text(encoding='utf-8')
    check('data-paused="true"' in page,'Paused product page not neutral '+p['id'])
hidden_skus={p.get('commerceSku') or p.get('sku') for p in paused}
for feed in ('google-merchant-draft.csv','meta-catalog-draft.csv'):
    with (ROOT/'feeds'/feed).open(encoding='utf-8-sig',newline='') as f:
        submitted={row['id'] for row in csv.DictReader(f) if row.get('id')}
        check(not hidden_skus.intersection(submitted),'Paused SKU in feed '+feed)
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
