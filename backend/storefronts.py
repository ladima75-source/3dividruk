"""Three themed storefronts; one catalog and one authenticated admin backend."""
from __future__ import annotations
import json
from pathlib import Path
from .catalog import products
from .db import connect

ROOT=Path(__file__).resolve().parent.parent
SECTIONS={'categories','featured','feature','story','benefits'}
LIMITS={
    'hero':{'eyebrow':180,'description':650},
    'categories':{'eyebrow':150,'title':200},
    'featured':{'eyebrow':150,'title':200,'description':500},
    'feature':{'eyebrow':150,'title':200,'description':650},
    'story':{'eyebrow':150,'title':200,'description':1000}
}

def storefront_registry():
    return json.loads((ROOT/'data/storefronts.json').read_text(encoding='utf-8'))

def storefront_homepages():
    content=json.loads((ROOT/'data/storefront-homepages.json').read_text(encoding='utf-8'))
    with connect() as db:
        for store in storefront_registry()['storefronts']:
            slug=store['id']
            row=db.execute('SELECT value_json FROM store_settings WHERE key=?',('storefront_homepage:'+slug,)).fetchone()
            if row:content['storefronts'][slug]=json.loads(row['value_json'])
    return content

def validate_storefront_homepage(slug,config):
    scopes={s['id']:s for s in storefront_registry()['storefronts']}
    if not isinstance(slug,str) or slug not in scopes:
        raise ValueError('INVALID_STOREFRONT')
    if not isinstance(config,dict) or set(config)!={'version','hero','categories','featured','feature','story','sections'} or config.get('version')!=1:
        raise ValueError('INVALID_STOREFRONT_CONFIG')
    for group,fields in LIMITS.items():
        part=config.get(group)
        if not isinstance(part,dict):raise ValueError('INVALID_STOREFRONT_CONFIG')
        for field,limit in fields.items():
            value=part.get(field)
            if not isinstance(value,str) or len(value)>limit or (field in ('title','description') and not value.strip()):
                raise ValueError('INVALID_STOREFRONT_TEXT')
    lines=config['hero'].get('titleLines')
    if not isinstance(lines,list) or len(lines)!=3 or any(not isinstance(s,str) or not s.strip() or len(s)>75 for s in lines):
        raise ValueError('INVALID_STOREFRONT_TEXT')
    sections=config.get('sections')
    if not isinstance(sections,list) or len(sections)!=len(SECTIONS) or not all(isinstance(s,str) for s in sections) or set(sections)!=SECTIONS:
        raise ValueError('INVALID_STOREFRONT_SECTIONS')
    allowed_categories=set(scopes[slug]['categories'])
    eligible={str(p.get('commerceSku') or p.get('sku')):p for p in products()
              if p.get('storefront_visible') is not False and p.get('enabled') is not False
              and p.get('category') in allowed_categories}
    chosen=config['featured'].get('skus')
    if not isinstance(chosen,list) or not 1<=len(chosen)<=12 or any(not isinstance(x,str) for x in chosen) or len(set(chosen))!=len(chosen):
        raise ValueError('INVALID_STOREFRONT_FEATURED')
    selection=[config['hero'].get('sku'),config['feature'].get('sku'),*chosen]
    if any(type(x) is not str or x not in eligible for x in selection):
        raise ValueError('INVALID_STOREFRONT_SKU')
    covers=config['categories'].get('covers')
    if not isinstance(covers,dict) or set(covers)!=allowed_categories:
        raise ValueError('INVALID_STOREFRONT_COVERS')
    for cat,sku in covers.items():
        if not isinstance(sku,str) or sku not in eligible or eligible[sku].get('category')!=cat:
            raise ValueError('INVALID_STOREFRONT_COVERS')
    return config

def update_storefront_homepage(slug,config):
    validate_storefront_homepage(slug,config)
    with connect() as db:
        db.execute('INSERT INTO store_settings(key,value_json) VALUES(?,?) '
                   'ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json',
                   ('storefront_homepage:'+slug,json.dumps(config,ensure_ascii=False)))
    return config
