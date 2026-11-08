"""Dependency-free local/standalone server. Start from repo: python -m backend.server.

Use a TLS reverse proxy for a deployed backend; never use GitHub Pages for private
data. This server never creates shipments, invoices, or outgoing messages.
"""
from __future__ import annotations
import hmac
import json
import mimetypes
import os
import re
import time
import urllib.parse
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from .db import migrate
from .catalog import products, update_product
from .orders import create_order, get_public_order, admin_list, update_status, settings, update_settings
from .services.delivery.nova_poshta import NovaPoshtaAdapter
from .services.delivery.base import DeliveryNotConfigured, DeliveryUpstreamError

ROOT = Path(__file__).resolve().parent.parent
RATE = defaultdict(deque)

MESSAGES = {
    'UNAUTHORIZED': 'Потрібна авторизація адміністратора.',
    'ADMIN_NOT_CONFIGURED': 'Доступ адміністратора ще не налаштовано на сервері.',
    'CHECKOUT_DISABLED': 'Оформлення замовлень ще не ввімкнено.',
    'PAYMENT_METHOD_DISABLED': 'Онлайн-оплата вимкнена. Доступна післяплата.',
    'SKU_NOT_FOUND': 'Товар не знайдено. Оновіть кошик.',
    'SKU_UNAVAILABLE': 'Товар зараз недоступний. Оновіть кошик.',
    'INSUFFICIENT_STOCK': 'Недостатньо товару в наявності.',
    'IDEMPOTENCY_CONFLICT': 'Цей запит уже використаний для іншого замовлення.',
    'INVALID_CUSTOMER': 'Перевірте ім’я та український номер телефону.',
    'DELIVERY_ADDRESS_REQUIRED': 'Укажіть місто та відділення доставки.',
    'RATE_LIMITED': 'Забагато запитів. Спробуйте пізніше.',
    'DELIVERY_NOT_CONFIGURED': 'Довідник перевізника не підключений. Укажіть відділення вручну.'
}

class Handler(BaseHTTPRequestHandler):
    server_version = '3DiViDruk'

    def log_message(self, format, *args):
        # Request paths may contain status tokens: never log them.
        return

    def _headers(self, status, content_type='application/json; charset=utf-8', length=None):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control', 'no-store' if self.path.startswith(('/api/','/admin','/config/runtime.js')) else 'no-cache')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('X-Frame-Options', 'DENY')
        origin = self.headers.get('Origin', '')
        allowed = [x.strip() for x in os.environ.get('DIVIDRUK_CORS_ORIGINS','').split(',') if x.strip()]
        if origin and origin in allowed:
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Authorization,Content-Type,Idempotency-Key')
        if length is not None:
            self.send_header('Content-Length', str(length))
        self.end_headers()

    def reply(self, value, status=200):
        body = json.dumps(value,ensure_ascii=False,separators=(',',':')).encode('utf-8')
        self._headers(status,length=len(body))
        self.wfile.write(body)

    def error(self, code, status=400):
        self.reply({'error': {'code':code,'message':MESSAGES.get(code,'Не вдалося виконати запит. Перевірте введені дані.')},
                    'code':code,'message':MESSAGES.get(code,'Не вдалося виконати запит. Перевірте введені дані.')},status)

    def admin(self):
        expected = os.environ.get('DIVIDRUK_ADMIN_TOKEN','')
        if len(expected) < 24:
            self.error('ADMIN_NOT_CONFIGURED',503)
            return False
        actual = self.headers.get('Authorization','')
        if not hmac.compare_digest(actual, 'Bearer ' + expected):
            self.error('UNAUTHORIZED',401)
            return False
        return True

    def body(self):
        try:
            size = int(self.headers.get('Content-Length','0'))
        except ValueError:
            raise ValueError('INVALID_BODY')
        if not 0 < size <= 65536:
            raise ValueError('INVALID_BODY')
        if self.headers.get_content_type() != 'application/json':
            raise ValueError('JSON_REQUIRED')
        value = json.loads(self.rfile.read(size).decode('utf-8'))
        if not isinstance(value,dict):
            raise ValueError('INVALID_BODY')
        return value

    def origin_ok(self):
        origin = self.headers.get('Origin')
        if not origin:
            return True
        host = self.headers.get('Host','')
        allowed = {f'http://{host}', f'https://{host}', *[x.strip() for x in os.environ.get('DIVIDRUK_CORS_ORIGINS','').split(',') if x.strip()]}
        return origin in allowed

    def rate_ok(self):
        key = (self.client_address[0],self.command)
        now = time.monotonic()
        queue = RATE[key]
        while queue and queue[0] < now-60:
            queue.popleft()
        if len(queue) >= 30:
            self.error('RATE_LIMITED',429)
            return False
        queue.append(now)
        return True

    def do_OPTIONS(self):
        if not self.origin_ok():
            return self.error('ORIGIN_NOT_ALLOWED',403)
        self._headers(204,length=0)

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path).path
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)
        try:
            if path == '/api/v1/health':
                return self.reply({'store':'3dividruk','status':'ok','test_mode':settings()['test_mode'],'online_payment_enabled':False})
            if path == '/api/v1/catalog':
                return self.reply({'products':products(),'taxonomy':json.loads((ROOT/'data/taxonomy.json').read_text(encoding='utf-8'))['categories'],'currency':'UAH'})
            if path == '/api/v1/payments/methods':
                state = settings()
                return self.reply({'methods':[{'id':'cod','method':'cod','label':'Післяплата','enabled':True}],
                                   'online_enabled':False,'test_mode':state['test_mode'],'demo':state['test_mode'],
                                   'checkout_enabled':state['test_mode'] or state['checkout_enabled']})
            if path == '/api/v1/delivery/providers':
                return self.reply({'providers':[{'id':'nova_poshta','label':'Нова пошта','lookup_enabled':bool(os.environ.get('DIVIDRUK_NOVA_POSHTA_API_KEY')),'shipment_creation':False},
                                                {'id':'ukrposhta','label':'Укрпошта','lookup_enabled':False,'shipment_creation':False},
                                                {'id':'pickup','label':'Самовивіз','lookup_enabled':False,'shipment_creation':False}]})
            if path == '/api/v1/delivery/cities':
                return self.reply({'items':NovaPoshtaAdapter().search_cities(query.get('q',[''])[0][:100])})
            if path == '/api/v1/delivery/branches':
                return self.reply({'items':NovaPoshtaAdapter().search_branches(query.get('city_ref',[''])[0][:100],query.get('q',[''])[0][:100])})
            if path.startswith('/api/v1/orders/'):
                oid = path.rsplit('/',1)[-1]
                token = query.get('token',[''])[0] or self.headers.get('X-Order-Token','')
                order = get_public_order(oid,token)
                return self.reply(order) if order else self.error('ORDER_NOT_FOUND',404)
            if path.startswith('/api/v1/admin/'):
                if not self.admin():
                    return
                if path == '/api/v1/admin/orders':
                    return self.reply({'orders':admin_list()})
                if path == '/api/v1/admin/catalog':
                    return self.reply({'products':products()})
                if path == '/api/v1/admin/settings':
                    return self.reply(settings())
                return self.error('NOT_FOUND',404)
            if path == '/config/runtime.js':
                state = settings()
                config = {'apiBaseUrl':'','checkoutMode':'backend','testMode':state['test_mode'],
                          'checkoutEnabled':state['test_mode'] or state['checkout_enabled'],
                          'endpoints':{'catalog':'/api/v1/catalog','createOrder':'/api/v1/orders','getOrder':'/api/v1/orders/{orderId}','paymentMethods':'/api/v1/payments/methods'},'requestTimeoutMs':12000}
                body = ('window.DIVIDRUK_COMMERCE_CONFIG = Object.freeze('+json.dumps(config)+');').encode()
                self._headers(200,'text/javascript; charset=utf-8',len(body))
                return self.wfile.write(body)
            return self.static(path)
        except DeliveryNotConfigured:
            self.error('DELIVERY_NOT_CONFIGURED',503)
        except DeliveryUpstreamError:
            self.error('DELIVERY_UPSTREAM_UNAVAILABLE',502)
        except (ValueError, TypeError, KeyError):
            self.error('INVALID_REQUEST',400)
        except Exception:
            self.error('SERVER_ERROR',500)

    def static(self, raw_path):
        path = urllib.parse.unquote(raw_path)
        if '\\' in path or '\x00' in path:
            return self.error('NOT_FOUND',404)
        parts = Path(path.lstrip('/')).parts
        allowed_dirs = {'assets','images','media','js','config','css','data','admin','products','categories','feeds','order'}
        if any(x.startswith('.') or x == '..' for x in parts) or (len(parts)>1 and parts[0] not in allowed_dirs):
            return self.error('NOT_FOUND',404)
        target = (ROOT / path.lstrip('/')).resolve()
        if ROOT not in target.parents and target != ROOT:
            return self.error('NOT_FOUND',404)
        if target.is_dir():
            target = target / 'index.html'
        if not target.is_file() or target.suffix.lower() not in {'.html','.css','.js','.json','.svg','.ico','.png','.jpg','.jpeg','.webp','.avif','.xml','.txt','.woff','.woff2'}:
            return self.error('NOT_FOUND',404)
        if target.suffix == '.json' and parts and parts[0] == 'data' and target.name != 'catalog.json':
            return self.error('NOT_FOUND',404)
        body = target.read_bytes()
        content_type = mimetypes.guess_type(target.name)[0] or 'application/octet-stream'
        if target.suffix in {'.html','.js','.css','.svg','.json','.xml','.txt'}:
            content_type += '; charset=utf-8'
        self._headers(200,content_type,len(body))
        self.wfile.write(body)

    def do_POST(self):
        return self.mutate()

    def do_PATCH(self):
        return self.mutate()

    def mutate(self):
        if not self.origin_ok():
            return self.error('ORIGIN_NOT_ALLOWED',403)
        if not self.rate_ok():
            return
        path = urllib.parse.urlsplit(self.path).path
        try:
            if path == '/api/v1/orders' and self.command == 'POST':
                return self.reply(create_order(self.body(),self.headers.get('Idempotency-Key','')),201)
            if path.startswith('/api/v1/admin/'):
                if not self.admin():
                    return
                data = self.body()
                if path.startswith('/api/v1/admin/catalog/') and self.command == 'PATCH':
                    sku = urllib.parse.unquote(path.removeprefix('/api/v1/admin/catalog/'))
                    value = update_product(sku,data)
                    return self.reply(value) if value else self.error('SKU_NOT_FOUND',404)
                if path.startswith('/api/v1/admin/orders/') and self.command == 'PATCH':
                    oid = path.rsplit('/',1)[-1]
                    value = update_status(oid,data.get('status'),data.get('note',''),data.get('tracking_number'))
                    return self.reply(value) if value else self.error('ORDER_NOT_FOUND',404)
                if path == '/api/v1/admin/settings' and self.command == 'PATCH':
                    return self.reply(update_settings(data))
            return self.error('NOT_FOUND',404)
        except ValueError as exc:
            code = str(exc)
            if not re.fullmatch('[A-Z0-9_]+',code):
                code = 'INVALID_REQUEST'
            self.error(code,409 if code=='IDEMPOTENCY_CONFLICT' else 400)
        except (KeyError, TypeError, AttributeError, UnicodeError):
            self.error('INVALID_REQUEST',400)
        except Exception:
            self.error('SERVER_ERROR',500)

def make_server(host='127.0.0.1',port=8080):
    migrate()
    return ThreadingHTTPServer((host,port),Handler)

if __name__ == '__main__':
    host = os.environ.get('DIVIDRUK_HOST','127.0.0.1')
    port = int(os.environ.get('DIVIDRUK_PORT','8080'))
    server = make_server(host,port)
    print(f'3DiViDruk: http://{host}:{port} (test mode: {settings()["test_mode"]})',flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
