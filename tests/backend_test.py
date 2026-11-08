"""Functional tests run only against temporary catalogs, databases and localhost."""
import copy
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

from backend.db import migrate, connect, database_path
from backend import orders
from backend.catalog import update_product, reorder_products, products
from backend.homepage import homepage, validate_homepage, update_homepage
from backend.server import make_server, RATE

class CommerceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self.tmp.name)
        catalog = [{'id':'prom-1','sku':'SKU0001','title':'Лампа','price':1900,'availability':'in_stock','stock_qty':3},
                   {'id':'prom-2','sku':'MG-0003','title':'Сумка','price':1300,'availability':'out_of_stock'},
                   {'id':'prom-3','sku':'SKU0003','title':'Ваза','price':950,'availability':'in_stock'}]
        self.catalog = self.directory / 'catalog.json'
        self.catalog.write_text(json.dumps({'products':catalog}),encoding='utf-8')
        self.env = patch.dict(os.environ,{'DIVIDRUK_DB_PATH':str(self.directory/'shop.sqlite3'),'DIVIDRUK_CATALOG_PATH':str(self.catalog),
                                        'DIVIDRUK_TEST_MODE':'1','DIVIDRUK_ADMIN_TOKEN':'a-test-only-token-with-32-chars',
                                        'BB610_DB_PATH':str(self.directory/'DO-NOT-CREATE.sqlite3')})
        self.env.start()
        migrate()
        self.payload = {'customer':{'name':'Тестова покупка','phone':'+380970000000','email':'test@example.invalid'},
                        'items':[{'sku':'SKU0001','quantity':2,'unit_price':1}],
                        'fulfillment':{'provider':'nova_poshta','service':'branch','city':'Дніпро','branch':'Відділення 1'},
                        'payment':{'method':'cod'},'test_order':True}

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    def test_server_prices_and_snapshots(self):
        result = orders.create_order(self.payload,'price-check-0001')
        self.assertEqual(result['total'],3800)
        self.assertTrue(result['test_order'])
        self.assertIsNone(result['delivery_total'])
        self.assertFalse(result['analytics']['purchase_ready'])
        update_product('SKU0001',{'price':2500})
        saved = orders.get_public_order(result['order_id'],result['public_token'])
        self.assertEqual(saved['total'],3800)
        self.assertNotIn('customer',saved)

    def test_idempotency_and_conflict(self):
        first = orders.create_order(self.payload,'same-order-0001')
        second = orders.create_order(self.payload,'same-order-0001')
        self.assertEqual(first,second)
        changed = copy.deepcopy(self.payload)
        changed['items'][0]['quantity'] = 1
        with self.assertRaisesRegex(ValueError,'IDEMPOTENCY_CONFLICT'):
            orders.create_order(changed,'same-order-0001')
        with connect() as con:
            self.assertEqual(con.execute('SELECT COUNT(*) FROM orders').fetchone()[0],1)

    def test_stock_duplicate_lines_and_foreign_sku(self):
        for items,error in [([{'sku':'MG-0003','quantity':1}],'SKU_UNAVAILABLE'),
                            ([{'sku':'SKU0001','quantity':2},{'sku':'SKU0001','quantity':2}],'INSUFFICIENT_STOCK'),
                            ([{'sku':'BB610-FOREIGN','quantity':1}],'SKU_NOT_FOUND'),
                            ([{'sku':'SKU0001','quantity':True}],'INVALID_QUANTITY')]:
            payload = {**self.payload,'items':items}
            with self.assertRaisesRegex(ValueError,error):
                orders.create_order(payload,'bad-item-0001')

    def test_public_status_requires_unguessable_token(self):
        result = orders.create_order(self.payload,'private-order-0001')
        self.assertIsNone(orders.get_public_order(result['order_id'],''))
        self.assertIsNone(orders.get_public_order(result['order_id'],'wrong'))
        self.assertIsNotNone(orders.get_public_order(result['order_id'],result['public_token']))

    def test_payment_cannot_be_enabled_by_browser(self):
        payload = {**self.payload,'payment':{'method':'online_card','paid':True}}
        with self.assertRaisesRegex(ValueError,'PAYMENT_METHOD_DISABLED'):
            orders.create_order(payload,'online-disabled-0001')
        with self.assertRaisesRegex(ValueError,'INVALID_SETTINGS'):
            orders.update_settings({'online_payment_enabled':True})

    def test_store_isolation_and_admin_lifecycle(self):
        self.assertEqual(database_path(),self.directory/'shop.sqlite3')
        result=orders.create_order(self.payload,'independent-0001')
        self.assertFalse((self.directory/'DO-NOT-CREATE.sqlite3').exists())
        self.assertTrue(result['order_number'].startswith('3D-'))
        with self.assertRaisesRegex(ValueError,'INVALID_TRANSITION'):
            orders.update_status(result['order_id'],'completed')
        value=orders.update_status(result['order_id'],'confirmed','Перевірено')
        self.assertEqual(value['status'],'confirmed')
        self.assertEqual(value['history'][-1]['note'],'Перевірено')

    def test_live_orders_locked_until_explicit_configuration(self):
        os.environ['DIVIDRUK_TEST_MODE']='0'
        payload = {**self.payload,'test_order':False}
        with self.assertRaisesRegex(ValueError,'CHECKOUT_DISABLED'):
            orders.create_order(payload,'live-locked-0001')

    def test_visual_merchandising_order_is_atomic_and_store_local(self):
        data=json.loads(self.catalog.read_text(encoding='utf-8'))
        for product in data['products']:
            if product['sku'] in ('SKU0001','SKU0003'):
                product['category']='lighting'
                product['subcategory']='table-lamps'
        self.catalog.write_text(json.dumps(data),encoding='utf-8')
        update_product('SKU0001',{'price':2250})
        result=reorder_products('lighting','table-lamps',['SKU0003','SKU0001'])
        self.assertEqual(result['count'],2)
        by_sku={p['sku']:p for p in products()}
        self.assertEqual(by_sku['SKU0003']['sort_order'],0)
        self.assertEqual(by_sku['SKU0001']['sort_order'],1)
        self.assertEqual(by_sku['SKU0001']['price'],2250)
        with self.assertRaisesRegex(ValueError,'DUPLICATE_SKU'):
            reorder_products('lighting','table-lamps',['SKU0003','SKU0003'])
        with self.assertRaisesRegex(ValueError,'ORDER_SCOPE_MISMATCH'):
            reorder_products('lighting','table-lamps',['MG-0003','SKU0001'])
        self.assertEqual({p['sku']:p['sort_order'] for p in products() if 'sort_order' in p},
                         {'SKU0001':1,'SKU0003':0})

    def test_homepage_editor_validation_and_persistence(self):
        root=Path(__file__).resolve().parents[1]
        master=json.loads((root/'data/catalog.json').read_text(encoding='utf-8'))
        defaults=json.loads((root/'data/homepage.json').read_text(encoding='utf-8'))
        chosen=set(defaults['featured']['skus']+[defaults['hero']['sku'],defaults['feature']['sku']]+list(defaults['categories']['covers'].values()))
        selected=[p for p in master['products'] if p.get('commerceSku') in chosen]
        self.assertEqual(len(selected),len(chosen))
        self.catalog.write_text(json.dumps({'products':selected}),encoding='utf-8')
        self.assertEqual(validate_homepage(defaults),defaults)
        self.assertEqual(update_homepage(defaults),defaults)
        changed=copy.deepcopy(defaults)
        changed['hero']['titleLines'][0]='Оновлена форма.'
        update_homepage(changed)
        self.assertEqual(homepage()['hero']['titleLines'][0],'Оновлена форма.')
        invalid=copy.deepcopy(defaults)
        invalid['featured']['skus']=['SKU MG-0001']
        with self.assertRaisesRegex(ValueError,'INVALID_HOMEPAGE_SKU'):
            validate_homepage(invalid)
        invalid=copy.deepcopy(defaults)
        invalid['sections']=['story','story','feature','categories','benefits']
        with self.assertRaisesRegex(ValueError,'INVALID_HOMEPAGE_SECTION'):
            validate_homepage(invalid)

    def test_media_editor_only_reorders_existing_photos(self):
        raw=json.loads(self.catalog.read_text(encoding='utf-8'))
        raw['products'][0]['images']=['assets/products/p1/a.jpg','assets/products/p1/b.jpg']
        self.catalog.write_text(json.dumps(raw),encoding='utf-8')
        result=update_product('SKU0001',{'images':['assets/products/p1/b.jpg','assets/products/p1/a.jpg']})
        self.assertEqual(result['images'][0],'assets/products/p1/b.jpg')
        with self.assertRaisesRegex(ValueError,'INVALID_IMAGE_ORDER'):
            update_product('SKU0001',{'images':['https://attacker.invalid/f.jpg','assets/products/p1/a.jpg']})
        with self.assertRaisesRegex(ValueError,'INVALID_IMAGE_ORDER'):
            update_product('SKU0001',{'images':['assets/products/p1/a.jpg','assets/products/p1/a.jpg']})

    def test_http_auth_runtime_origin_and_private_paths(self):
        RATE.clear()
        server=make_server('127.0.0.1',0)
        thread=threading.Thread(target=server.serve_forever,daemon=True)
        thread.start()
        base=f'http://127.0.0.1:{server.server_port}'
        def request(path,headers=None,body=None):
            data=None if body is None else json.dumps(body).encode()
            req=urllib.request.Request(base+path,data=data,headers=headers or {})
            try:
                with urllib.request.urlopen(req) as response:
                    return response.status,response.read()
            except urllib.error.HTTPError as response:
                with response:
                    return response.code,response.read()
        try:
            self.assertEqual(request('/api/v1/admin/orders')[0],401)
            self.assertEqual(request('/api/v1/admin/orders',{'Authorization':'Bearer a-test-only-token-with-32-chars'})[0],200)
            os.environ['DIVIDRUK_ADMIN_TOKEN']=''
            self.assertEqual(request('/api/v1/admin/orders')[0],503)
            for path in ('/backend/runtime/3dividruk.sqlite3','/backend/server.py','/.env','/../backend/server.py','/%2e%2e/backend/server.py','/tests/backend_test.py'):
                self.assertEqual(request(path)[0],404,path)
            code,body=request('/config/runtime.js')
            self.assertEqual(code,200)
            self.assertIn(b'"checkoutMode": "backend"',body)
            self.assertEqual(request('/api/v1/orders',{'Content-Type':'application/json','Origin':'https://evil.invalid','Idempotency-Key':'origin-00001'},self.payload)[0],403)
            code,body=request('/api/v1/orders',{'Content-Type':'application/json','Idempotency-Key':'http-order-0001'},self.payload)
            self.assertEqual(code,201,body)
            self.assertEqual(json.loads(body)['total'],3800)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

if __name__=='__main__':
    unittest.main()
