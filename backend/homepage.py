"""3DiViDruk editable homepage: authenticated server-side overrides, preview defaults on GitHub Pages."""
from __future__ import annotations
import json
from pathlib import Path
from .db import connect
from .catalog import source_products

ROOT=Path(__file__).resolve().parent.parent
SECTIONS=('categories','featured','feature','story','benefits')
FIELDS={
    'hero': {'eyebrow':180,'description':650},
    'categories': {'eyebrow':150,'title':200},
    'featured': {'eyebrow':150,'title':200,'description':500},
    'feature': {'eyebrow':150,'title':200,'description':650},
    'story': {'eyebrow':150,'title':200,'description':1000}
}

def homepage():
    default=json.loads((ROOT/'data/homepage.json').read_text(encoding='utf-8'))
    with connect() as db:
        row=db.execute('SELECT value_json FROM store_settings WHERE key=?',('homepage',)).fetchone()
    return json.loads(row[0]) if row else default

def validate_homepage(data):
    if not isinstance(data,dict) or set(data)!={'version','hero','categories','featured','feature','story','sections'} or data['version']!=1:
        raise ValueError('INVALID_HOMEPAGE')
    def valid_text(value,limit,required=False):
        return type(value) is str and len(value)<=limit and (not required or bool(value.strip()))
    for group,fields in FIELDS.items():
        section=data.get(group)
        if not isinstance(section,dict): raise ValueError('INVALID_HOMEPAGE')
        for field,limit in fields.items():
            if not valid_text(section.get(field),limit,field in ('title','description')):
                raise ValueError('INVALID_HOMEPAGE_TEXT')
    title_lines=data['hero'].get('titleLines')
    if not isinstance(title_lines,list) or len(title_lines)!=3 or any(not valid_text(x,75,True) for x in title_lines):
        raise ValueError('INVALID_HOMEPAGE_TEXT')
    sections=data['sections']
    if not isinstance(sections,list) or len(sections)!=len(SECTIONS) or set(sections)!=set(SECTIONS):
        raise ValueError('INVALID_HOMEPAGE_SECTION')
    products={str(p.get('commerceSku') or p.get('sku')):p for p in source_products() if p.get('storefront_visible') is not False and p.get('enabled') is not False}
    def check_sku(code,category=None):
        if not isinstance(code,str) or code not in products: raise ValueError('INVALID_HOMEPAGE_SKU')
        if category is not None and products[code]['category']!=category: raise ValueError('INVALID_HOMEPAGE_CATEGORY')
    check_sku(data['hero'].get('sku'))
    check_sku(data['feature'].get('sku'))
    featured=data['featured'].get('skus')
    if not isinstance(featured,list) or not 1<=len(featured)<=12 or len(featured)!=len(set(featured)):
        raise ValueError('INVALID_HOMEPAGE_FEATURED')
    for sku in featured:check_sku(sku)
    covers=data['categories'].get('covers')
    expected={'lighting','vases','planters','decor'}
    if not isinstance(covers,dict) or set(covers)!=expected:raise ValueError('INVALID_HOMEPAGE_COVERS')
    for category,sku in covers.items():check_sku(sku,category)
    return data

def update_homepage(data):
    validate_homepage(data)
    with connect() as db:
        db.execute('INSERT INTO store_settings(key,value_json) VALUES(?,?) '
                   'ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json',
                   ('homepage',json.dumps(data,ensure_ascii=False)))
    return data
