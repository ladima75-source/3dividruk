"""Order lifecycle adapted from BB610 Market services/orders.py.

Retains its status transitions, server pricing, idempotency hashes, public token
hash checks and immutable order snapshots. External automation is omitted.
"""
from __future__ import annotations
import hashlib
import json
import os
import re
import secrets
import uuid
from datetime import datetime, timezone
from .db import connect
from .catalog import resolve_order_items

ORDER_STATUSES = ('new','confirmed','preparing','shipped','completed','cancelled')
TRANSITIONS = {
    'new': {'confirmed','cancelled'},
    'confirmed': {'new','preparing','cancelled'},
    'preparing': {'confirmed','shipped','cancelled'},
    'shipped': {'preparing','completed'},
    'completed': set(), 'cancelled': set()
}

def now():
    return datetime.now(timezone.utc).isoformat()

def token_hash(value):
    return hashlib.sha256(value.encode()).hexdigest()

def req_hash(payload):
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(',',':')).encode()).hexdigest()

def order_number():
    return f"3D-{datetime.now(timezone.utc).strftime('%y%m%d')}-{secrets.token_hex(4).upper()}"

def settings(con=None):
    own = con is None
    con = con or connect()
    try:
        saved = {row['key']: json.loads(row['value_json']) for row in con.execute('SELECT * FROM store_settings')}
        return {'checkout_enabled': saved.get('checkout_enabled', False),
                'test_mode': os.environ.get('DIVIDRUK_TEST_MODE', '1') != '0',
                'currency': 'UAH', 'online_payment_enabled': False,
                'delivery_price_policy': 'carrier_tariff',
                'payment_methods': ['cod'],
                'shipping_providers': ['nova_poshta','ukrposhta','pickup']}
    finally:
        if own:
            con.close()

def update_settings(data):
    if not isinstance(data, dict) or set(data) - {'checkout_enabled'} or type(data.get('checkout_enabled')) is not bool:
        raise ValueError('INVALID_SETTINGS')
    with connect() as con:
        con.execute("INSERT INTO store_settings(key,value_json) VALUES('checkout_enabled',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json", (json.dumps(data['checkout_enabled']),))
    return settings()

def normalize_customer(value):
    if not isinstance(value, dict):
        raise ValueError('INVALID_CUSTOMER')
    name = str(value.get('name', '')).strip()
    phone = re.sub(r'[^0-9+]', '', str(value.get('phone', '')))
    email = str(value.get('email') or '').strip()
    if not 2 <= len(name) <= 120 or not re.fullmatch(r'\+?380\d{9}|0\d{9}', phone):
        raise ValueError('INVALID_CUSTOMER')
    if email and (len(email) > 254 or not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+', email)):
        raise ValueError('INVALID_EMAIL')
    return {'name': name, 'phone': phone, 'email': email}

def normalize_fulfillment(value):
    if not isinstance(value, dict):
        raise ValueError('INVALID_FULFILLMENT')
    provider = value.get('provider') or value.get('method')
    if provider == 'pickup_dnipro':
        provider = 'pickup'
    service = value.get('service') or ('pickup' if provider == 'pickup' else 'branch')
    if provider not in ('nova_poshta','ukrposhta','pickup') or service not in ({'branch','locker'} if provider == 'nova_poshta' else {'branch'} if provider == 'ukrposhta' else {'pickup'}):
        raise ValueError('INVALID_FULFILLMENT')
    result = {'provider': provider, 'service': service}
    for field in ('city','city_ref','branch','branch_ref','address_line','postal_code'):
        raw = value.get(field) or ''
        if not isinstance(raw, str) or len(raw) > 300:
            raise ValueError('INVALID_FULFILLMENT')
        result[field] = raw.strip()
    if provider != 'pickup' and (not result['city'] or not (result['branch'] or result['address_line'])):
        raise ValueError('DELIVERY_ADDRESS_REQUIRED')
    result['price_policy'] = 'carrier_tariff'
    result['delivery_total'] = None
    return result

def _public_order(row, include_token=None):
    test = bool(row['test_order'])
    result = {'order_id': row['id'], 'order_number': row['order_number'],
              'status': row['status'], 'created_at': row['created_at'],
              'currency': row['currency'], 'subtotal': row['subtotal_minor'] / 100,
              'total': row['subtotal_minor'] / 100, 'delivery_total': None,
              'delivery_price_policy': 'carrier_tariff', 'items': json.loads(row['items_json']),
              'payment': {'method': 'cod', 'status': 'pending', 'online_enabled': False},
              'test_order': test, 'clear_cart': True,
              'analytics': {'purchase_ready': False}, 'tracking_number': row['tracking_number'],
              'customer_message': 'Тестове замовлення збережено. Оплата не проводилася.' if test else 'Замовлення прийнято. Очікуйте підтвердження магазину.'}
    if include_token is not None:
        result['public_token'] = include_token
    return result

def create_order(payload, idem_key):
    if not isinstance(payload, dict):
        raise ValueError('INVALID_ORDER')
    if not isinstance(idem_key, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{8,128}', idem_key):
        raise ValueError('IDEMPOTENCY_KEY_REQUIRED')
    if payload.get('currency', 'UAH') != 'UAH':
        raise ValueError('INVALID_CURRENCY')
    if (payload.get('payment') or {}).get('method') != 'cod':
        raise ValueError('PAYMENT_METHOD_DISABLED')
    customer = normalize_customer(payload.get('customer'))
    fulfillment = normalize_fulfillment(payload.get('fulfillment'))
    comment = payload.get('comment') or ''
    if not isinstance(comment, str) or len(comment) > 1000:
        raise ValueError('INVALID_COMMENT')
    with connect() as con:
        # Serialize idempotency+stock checks with catalog/admin writes.
        con.execute('BEGIN IMMEDIATE')
        state = settings(con)
        test = state['test_mode']
        if not test and not state['checkout_enabled']:
            raise ValueError('CHECKOUT_DISABLED')
        if not test and payload.get('test_order') is True:
            raise ValueError('TEST_ORDER_REQUIRES_TEST_MODE')
        request_hash = req_hash(payload)
        old = con.execute('SELECT * FROM idempotency_keys WHERE key=?', (idem_key,)).fetchone()
        if old:
            if old['request_hash'] != request_hash:
                raise ValueError('IDEMPOTENCY_CONFLICT')
            row = con.execute('SELECT * FROM orders WHERE id=?', (old['order_id'],)).fetchone()
            return _public_order(row, old['public_token'])
        items = resolve_order_items(payload.get('items'), con)
        subtotal = sum(item['unit_price_minor'] * item['quantity'] for item in items)
        oid, token = str(uuid.uuid4()), secrets.token_urlsafe(32)
        timestamp = now()
        number = order_number()
        con.execute('''INSERT INTO orders(id,order_number,public_token_hash,created_at,updated_at,status,currency,subtotal_minor,customer_json,fulfillment_json,items_json,comment,test_order)
            VALUES(?,?,?,?,?,'new','UAH',?,?,?,?,?,?)''',
                    (oid,number,token_hash(token),timestamp,timestamp,subtotal,
                     json.dumps(customer,ensure_ascii=False),json.dumps(fulfillment,ensure_ascii=False),json.dumps(items,ensure_ascii=False),comment,int(test)))
        con.execute('INSERT INTO idempotency_keys(key,request_hash,order_id,public_token) VALUES(?,?,?,?)', (idem_key,request_hash,oid,token))
        con.execute('INSERT INTO order_status_history(order_id,from_status,to_status,note,created_at) VALUES(?,NULL,?,?,?)', (oid,'new','Order created',timestamp))
        con.commit()
        return _public_order(con.execute('SELECT * FROM orders WHERE id=?', (oid,)).fetchone(),token)

def get_public_order(order_id, token):
    if not token or len(token) > 200:
        return None
    with connect() as con:
        row = con.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone()
        if not row or not secrets.compare_digest(row['public_token_hash'],token_hash(token)):
            return None
        return _public_order(row)

def admin_detail(order_id, con=None):
    own = con is None
    con = con or connect()
    try:
        row = con.execute('SELECT * FROM orders WHERE id=?', (order_id,)).fetchone()
        if not row:
            return None
        return {**_public_order(row), 'customer': json.loads(row['customer_json']),
                'fulfillment': json.loads(row['fulfillment_json']), 'comment': row['comment'],
                'history': [dict(x) for x in con.execute('SELECT from_status,to_status,note,created_at FROM order_status_history WHERE order_id=? ORDER BY id', (order_id,))]}
    finally:
        if own:
            con.close()

def admin_list():
    with connect() as con:
        return [admin_detail(row['id'], con) for row in con.execute('SELECT id FROM orders ORDER BY created_at DESC LIMIT 200')]

def update_status(order_id, new_status, note='', tracking_number=None):
    if new_status not in ORDER_STATUSES or not isinstance(note,str) or len(note)>1000:
        raise ValueError('INVALID_STATUS')
    if tracking_number is not None and (not isinstance(tracking_number,str) or len(tracking_number)>100):
        raise ValueError('INVALID_TRACKING')
    with connect() as con:
        row = con.execute('SELECT * FROM orders WHERE id=?',(order_id,)).fetchone()
        if not row:
            return None
        old = row['status']
        if new_status != old and new_status not in TRANSITIONS.get(old,set()):
            raise ValueError('INVALID_TRANSITION')
        if new_status != old:
            con.execute('INSERT INTO order_status_history(order_id,from_status,to_status,note,created_at) VALUES(?,?,?,?,?)',(order_id,old,new_status,note,now()))
        con.execute('UPDATE orders SET status=?,updated_at=?,tracking_number=? WHERE id=?',(new_status,now(),row['tracking_number'] if tracking_number is None else tracking_number,order_id))
        con.commit()
        return admin_detail(order_id,con)
