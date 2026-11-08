from __future__ import annotations
import json
import os
from decimal import Decimal, InvalidOperation
from pathlib import Path
from .db import connect

ROOT = Path(__file__).resolve().parent.parent

class CatalogError(ValueError):
    pass

def source_products():
    path = Path(os.environ.get('DIVIDRUK_CATALOG_PATH') or str(ROOT / 'data' / 'catalog.json'))
    data = json.loads(path.read_text(encoding='utf-8-sig'))
    return data if isinstance(data, list) else data.get('products', [])

def minor(value):
    try:
        amount = Decimal(str(value))
        if not amount.is_finite() or amount <= 0 or amount > 10_000_000:
            raise ValueError('INVALID_PRICE')
        return int((amount * 100).quantize(Decimal('1')))
    except (InvalidOperation, TypeError):
        raise ValueError('INVALID_PRICE')

def products(con=None):
    own = con is None
    con = con or connect()
    try:
        overrides = {r['sku']: json.loads(r['data_json']) for r in con.execute('SELECT sku,data_json FROM product_overrides')}
        return [{**p, **overrides.get(str(p.get('commerceSku') or p.get('sku') or ''), {})} for p in source_products()]
    finally:
        if own:
            con.close()

def available(product):
    state = str(product.get('availability', '')).lower().replace('-', '_')
    if product.get('storefront_visible') is False:
        return False
    if product.get('enabled') is False or state in ('out_of_stock','outofstock','unavailable','sold_out','нет в наличии','немає в наявності'):
        return False
    if product.get('available') is False:
        return False
    return state in ('in_stock','instock','available','preorder','pre_order','backorder','в наявності','під замовлення') or product.get('available') is True

def resolve_order_items(items, con):
    if not isinstance(items, list) or not 1 <= len(items) <= 50:
        raise CatalogError('INVALID_ITEMS')
    catalog = {str(p.get('commerceSku') or p.get('sku')): p for p in products(con)}
    quantities = {}
    for item in items:
        if not isinstance(item, dict):
            raise CatalogError('INVALID_ITEM')
        sku, qty = str(item.get('sku', '')), item.get('quantity')
        if isinstance(qty, bool) or not isinstance(qty, int) or not 1 <= qty <= 99:
            raise CatalogError('INVALID_QUANTITY')
        quantities[sku] = quantities.get(sku, 0) + qty
        if quantities[sku] > 99:
            raise CatalogError('INVALID_QUANTITY')
    result = []
    for sku, qty in quantities.items():
        product = catalog.get(sku)
        if not product:
            raise CatalogError('SKU_NOT_FOUND')
        if not available(product):
            raise CatalogError('SKU_UNAVAILABLE')
        stock = product.get('stock_qty')
        if stock is not None and qty > int(stock):
            raise CatalogError('INSUFFICIENT_STOCK')
        unit = minor(product.get('price'))
        result.append({'sku': sku, 'product_id': str(product.get('id') or product.get('sourceProductId') or sku),
                       'name': product.get('title') or product.get('name') or sku,
                       'unit_price': unit / 100, 'unit_price_minor': unit,
                       'quantity': qty, 'line_total': unit * qty / 100})
    return result

def update_product(sku, data):
    if not any(str(p.get('commerceSku') or p.get('sku')) == sku for p in source_products()):
        return None
    if not isinstance(data, dict) or not data:
        raise ValueError('EMPTY_PRODUCT_UPDATE')
    allowed = {'title','description','price','availability','stock_qty','enabled','images'}
    if set(data) - allowed:
        raise ValueError('UNSUPPORTED_PRODUCT_FIELD')
    if 'images' in data:
        source = next((p for p in source_products() if str(p.get('commerceSku') or p.get('sku')) == sku), None)
        originals = source.get('images',[]) if source else []
        proposed = data['images']
        # Only reorder existing photos; never trust new paths or external media URLs.
        if (not isinstance(proposed,list) or len(proposed)!=len(originals)
            or not all(isinstance(x,str) for x in proposed)
            or len(set(proposed))!=len(proposed) or set(proposed)!=set(originals)):
            raise ValueError('INVALID_IMAGE_ORDER')
    if 'price' in data:
        minor(data['price'])
    if 'availability' in data and data['availability'] not in ('in_stock','out_of_stock','preorder'):
        raise ValueError('INVALID_AVAILABILITY')
    if 'stock_qty' in data and data['stock_qty'] is not None and (type(data['stock_qty']) is not int or data['stock_qty'] < 0):
        raise ValueError('INVALID_STOCK')
    if 'enabled' in data and type(data['enabled']) is not bool:
        raise ValueError('INVALID_ENABLED')
    for field in ('title','description'):
        if field in data and (not isinstance(data[field], str) or len(data[field]) > (300 if field == 'title' else 30000)):
            raise ValueError('INVALID_PRODUCT_TEXT')
    from .orders import now
    with connect() as con:
        old = con.execute('SELECT data_json FROM product_overrides WHERE sku=?', (sku,)).fetchone()
        merged = {**(json.loads(old[0]) if old else {}), **data}
        con.execute('INSERT INTO product_overrides(sku,data_json,updated_at) VALUES(?,?,?) ON CONFLICT(sku) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at',
                    (sku, json.dumps(merged, ensure_ascii=False), now()))
    return next(p for p in products() if str(p.get('commerceSku') or p.get('sku')) == sku)


def reorder_products(category, subcategory, sku_order):
    """Atomically replace display order for exactly one catalogue subgroup."""
    if not isinstance(category, str) or len(category) > 50:
        raise ValueError('INVALID_CATEGORY')
    if subcategory is not None and (not isinstance(subcategory, str) or len(subcategory) > 80):
        raise ValueError('INVALID_SUBCATEGORY')
    if not isinstance(sku_order, list) or not 1 <= len(sku_order) <= 500:
        raise ValueError('INVALID_ORDER')
    if any(not isinstance(sku, str) or not sku or len(sku) > 150 for sku in sku_order):
        raise ValueError('INVALID_SKU')
    if len(sku_order) != len(set(sku_order)):
        raise ValueError('DUPLICATE_SKU')
    from .orders import now
    with connect() as con:
        scoped = [p for p in products(con) if p.get('category') == category
                  and (subcategory is None or p.get('subcategory') == subcategory)]
        identities = {str(p.get('commerceSku') or p.get('sku')) for p in scoped}
        if identities != set(sku_order):
            raise ValueError('ORDER_SCOPE_MISMATCH')
        for position, sku in enumerate(sku_order):
            prev = con.execute('SELECT data_json FROM product_overrides WHERE sku=?', (sku,)).fetchone()
            current = json.loads(prev[0]) if prev else {}
            current['sort_order'] = position
            con.execute(
                'INSERT INTO product_overrides(sku,data_json,updated_at) VALUES(?,?,?) '
                'ON CONFLICT(sku) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at',
                (sku, json.dumps(current, ensure_ascii=False), now()))
    return {'ok': True, 'category': category, 'subcategory': subcategory,
            'count': len(sku_order)}
