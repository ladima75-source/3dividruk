"""Apply a validated visual-admin JSON export to the static preview source.

Usage:
  python tools/apply_editor_draft.py /path/to/3dividruk-editor-draft.json --check
  python tools/apply_editor_draft.py /path/to/3dividruk-editor-draft.json

Changes only this repository's data/catalog.json and data/homepage.json.
Then run: python tools/build.py && python tools/validate.py
Never changes Prom.ua, domain, backend DB, or BB610 Market.
"""
from __future__ import annotations
import argparse
import json
import math
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from backend.homepage import validate_homepage

def apply_draft(path:Path,check:bool=False):
    if path.stat().st_size>2_000_000:raise ValueError('Draft exceeds 2MB')
    draft=json.loads(path.read_text(encoding='utf-8-sig'))
    if not isinstance(draft,dict) or draft.get('version')!=1 or draft.get('kind')!='3dividruk-catalog-draft':
        raise ValueError('Wrong 3DiViDruk export file')
    original=json.loads((ROOT/'data/catalog.json').read_text(encoding='utf-8-sig'))
    products=original['products']
    by_sku={str(p.get('commerceSku') or p.get('sku')):p for p in products}
    if len(by_sku)!=len(products):raise ValueError('Catalog has duplicate commerce SKUs')
    edits=draft.get('products') or {}
    orders=draft.get('orders') or {}
    if not isinstance(edits,dict) or not isinstance(orders,dict):raise ValueError('Invalid draft structure')
    changes=0
    for sku,fields in edits.items():
        p=by_sku.get(sku)
        if p is None or not isinstance(fields,dict):raise ValueError('Unrecognized SKU '+sku)
        if set(fields)-{'title','description','price','images'}:raise ValueError('Unsupported edit field '+sku)
        if 'title' in fields and (type(fields['title']) is not str or not fields['title'].strip() or len(fields['title'])>300):
            raise ValueError('Invalid title '+sku)
        if 'description' in fields and (type(fields['description']) is not str or len(fields['description'])>30000):
            raise ValueError('Invalid description '+sku)
        if 'price' in fields and (type(fields['price']) not in (float,int) or not math.isfinite(fields['price']) or fields['price']<=0 or fields['price']>10_000_000):
            raise ValueError('Invalid price '+sku)
        if 'images' in fields:
            photos=fields['images']
            original_images=p.get('images',[])
            if (not isinstance(photos,list) or len(photos)!=len(original_images) or
                not all(isinstance(v,str) for v in photos) or
                len(set(photos))!=len(photos) or set(photos)!=set(original_images)):
                raise ValueError('Can only reorder existing photos for '+sku)
        p.update(fields)
        changes+=1
    for group,sequence in orders.items():
        if not isinstance(group,str) or '::' not in group or not isinstance(sequence,list):
            raise ValueError('Invalid reorder group')
        category,subcategory=group.split('::',1)
        if subcategory=='-':subcategory=None
        scoped={str(p.get('commerceSku') or p.get('sku')) for p in products if p.get('storefront_visible') is not False
                and p.get('category')==category and (subcategory is None or p.get('subcategory')==subcategory)}
        if not scoped or len(sequence)!=len(scoped) or set(sequence)!=scoped or len(sequence)!=len(set(sequence)):
            raise ValueError('Reorder must include exactly the visible SKUs in '+group)
        for pos,sku in enumerate(sequence):by_sku[sku]['sort_order']=pos
    homepage=draft.get('homepage')
    if homepage is not None:
        if not isinstance(homepage,dict):raise ValueError('Invalid homepage')
        # validate_homepage reads the on-disk catalog; the SKU universe remains stable here.
        validate_homepage(homepage)
    if not check:
        (ROOT/'data/catalog.json').write_text(json.dumps(original,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
        if homepage is not None:
            (ROOT/'data/homepage.json').write_text(json.dumps(homepage,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'validated':True,'dry_run':check,'edited_products':changes,'reordered_groups':len(orders),
                      'homepage_changed':homepage is not None,'total_products':len(products)},ensure_ascii=False))

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('draft',type=Path)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    apply_draft(args.draft,args.check)
