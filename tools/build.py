"""Build crawlable product pages, sitemap and draft feeds from imported public data.
Run from any directory: python tools/build.py. Preview is noindex by default.
No deployment, credentials, payment or production-domain changes.
"""
import csv
import html
import io
import json
from pathlib import Path
from urllib.parse import urlparse
from xml.sax.saxutils import escape as xml

ROOT=Path(__file__).resolve().parents[1]
SITE='https://ladima75-source.github.io/3dividruk/'
TAXONOMY=json.loads((ROOT/'data/taxonomy.json').read_text(encoding='utf-8'))['categories']
LABELS={category['id']:category['label'] for category in TAXONOMY}
SUBLABELS={(category['id'], sub['id']): sub['label'] for category in TAXONOMY for sub in category.get('subcategories', [])}

def category(title):
    title=title.lower()
    if 'сумк' in title:return 'bags'
    if 'ламп' in title or 'світильник' in title:return 'lighting'
    if 'ваза' in title or 'вази' in title:return 'vases'
    if 'горщик' in title or 'кашпо' in title:return 'planters'
    return 'decor'

def subcategory(category_id, title):
    """Classify by the product's actual type, not by arbitrary wording in its description."""
    name=title.casefold().strip()
    if category_id == 'lighting':
        if name.startswith('настільна'): return 'table-lamps'
        if name.startswith('підвісна'): return 'pendant-lamps'
    if category_id == 'decor':
        if name.startswith(('чаша', 'тарілка', 'органайзер')): return 'bowls-organizers'
        if name.startswith('фігурка'): return 'figurines'
        if name.startswith('підставка для благовоній'): return 'incense-holders'
        if name.startswith('настінна фігура'): return 'wall-art'
    if category_id in ('lighting', 'decor'):
        raise ValueError(f'Product needs manual subcategory review: {title}')
    return None

def shell(title,page,body='',depth=0,product=None,route_name=None,hidden=False):
    prefix='../'*depth or './'
    e=html.escape
    description=('Цей виріб тимчасово не представлений у каталозі 3DiViDruk.' if hidden else (product or {}).get('description','Дизайнерські лампи, вази, кашпо, декор та аксесуари з 3D-друку. Власне виробництво в Україні.'))[:180]
    page_route=route_name or page
    route=f'products/{product["id"]}/' if product else ('' if page_route=='home' else page_route+'.html')
    canonical=SITE+route
    structured=''
    if product and not hidden:
        p=product
        obj={'@context':'https://schema.org','@type':'Product','name':p['title'],'sku':p.get('sku',''),'description':p.get('description',''),'image':[SITE+i if not i.startswith('https://') else i for i in p['images']],'url':canonical,'brand':{'@type':'Brand','name':'3DiViDruk'}}
        # Draft preview: don't claim live purchasable Offer before backend launch.
        structured='<script type="application/ld+json">'+json.dumps(obj,ensure_ascii=False).replace('<','\\u003c')+'</script>'
    return f'''<!doctype html>
<html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)} · 3DiViDruk</title><meta name="description" content="{e(description,quote=True)}"><meta name="robots" content="noindex,nofollow">
<meta name="store-base" content="{prefix}"><link rel="canonical" href="{e(canonical)}"><meta property="og:title" content="{e(title,quote=True)}"><meta property="og:type" content="{'product' if product and not hidden else 'website'}"><meta property="og:locale" content="uk_UA"><meta property="og:url" content="{e(canonical)}"><meta property="og:site_name" content="3DiViDruk">
<link rel="icon" href="{prefix}assets/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="{prefix}css/store.css">{structured}
<script defer src="{prefix}config/runtime.js"></script><script defer src="{prefix}js/cart-core.js"></script><script defer src="{prefix}js/order-client.js"></script><script defer src="{prefix}js/store.js"></script></head>
<body data-page="{page}"{(' data-product-id="'+e(product['id'],quote=True)+'"') if product else ''}{' data-paused="true"' if hidden else ''}><div id="site-header"></div><main id="main"><div id="app">{body or '<div class="wrap loading" role="status">Завантажуємо колекцію…</div>'}</div></main><div id="site-footer"></div><noscript><p style="padding:30px">Для кошика та пошуку потрібен JavaScript. <a href="https://3dividruk.com.ua/ua/">Відкрити магазин на Prom.ua</a></p></noscript></body></html>'''

def policy(title,content):
    return '<div class="wrap policy"><div class="breadcrumb"><a href="index.html">Головна</a> / Інформація</div><h1 class="page-title">'+title+'</h1>'+content+'</div>'

def build():
    raw=json.loads((ROOT/'data/catalog.json').read_text(encoding='utf-8-sig'))
    products=raw if isinstance(raw,list) else raw['products']
    visibility=json.loads((ROOT/'config/storefront-visibility.json').read_text(encoding='utf-8'))
    paused_categories=set(visibility.get('paused_categories', []))
    paused_product_ids=set(visibility.get('paused_product_ids', []))
    seen=set()
    for p in products:
        p['id']=str(p.get('id') or p.get('sourceProductId'))
        if not p['id'].isdigit():raise ValueError('Product ids must be numeric public Prom ids')
        if p['id'] in seen:raise ValueError('Duplicate product id '+p['id'])
        seen.add(p['id'])
        p['title']=p.get('title') or p.get('name','')
        p['category']=category(p['title'])
        p['categoryLabel']=LABELS[p['category']]
        p['subcategory']=subcategory(p['category'],p['title'])
        p['subcategoryLabel']=SUBLABELS.get((p['category'],p['subcategory']),'')
        p['storefront_visible']=p['category'] not in paused_categories and p['id'] not in paused_product_ids
        p['images']=[i if isinstance(i,str) else i.get('local') or i.get('url') for i in (p.get('images') or p.get('localImages') or p.get('imageUrls') or [])]
        p['images']=[i for i in p['images'] if i and (i.startswith('assets/') or urlparse(i).scheme=='https')]
        if not p['images']:p['images']=['assets/placeholder.svg']
        if not p.get('sku'):p['sku']=''
        p['commerceSku']=p.get('commerceSku') or p['sku'] or ('PROM-'+p['id'])
        p['description']=p.get('description') or p.get('descriptionText') or ''
    visible_products=[p for p in products if p['storefront_visible']]
    normalized={'store':'3DiViDruk','source':'https://3dividruk.com.ua/ua/','importedAt':raw.get('importedAt','2026-11-08') if isinstance(raw,dict) else '2026-11-08','taxonomy':TAXONOMY,'products':products}
    (ROOT/'data/catalog.json').write_text(json.dumps(normalized,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    for name,title in {'index':'Дизайн у новому вимірі','catalog':'Колекція','cart':'Кошик','checkout':'Тестове оформлення','product':'Виріб','order':'Тестове замовлення'}.items():
        (ROOT/(name+'.html')).write_text(shell(title,'home' if name=='index' else name),encoding='utf-8')
    for p in products:
        folder=ROOT/'products'/p['id'];folder.mkdir(parents=True,exist_ok=True)
        if p['storefront_visible']:
            body=f'<article class="wrap"><h1>{html.escape(p["title"])}</h1><p>{html.escape(p.get("sku",""))}</p><p>{html.escape(p.get("description", "")[:1000])}</p></article>'
            page_html=shell(p['title'],'product',body,2,p)
        else:
            body='<div class="wrap empty"><h1>Виріб тимчасово не представлений</h1><p>Цю позицію знято з вітрини. Інші вироби доступні в каталозі.</p><a class="btn" href="../../catalog.html">Перейти до каталогу ↗</a></div>'
            page_html=shell('Виріб тимчасово не представлений','product',body,2,product=p,hidden=True)
        (folder/'index.html').write_text(page_html,encoding='utf-8')
    policies={
      'about':('Майстерня 3DiViDruk.','<p>Ми створюємо предмети інтер’єру та аксесуари за допомогою 3D-друку в Україні: дизайнерське освітлення, вази, кашпо, декор.</p><p>Це незалежна тестова вітрина 3DiViDruk. Наш магазин на Prom.ua продовжує приймати справжні замовлення.</p><p><a class="btn" href="https://3dividruk.com.ua/ua/">Магазин на Prom.ua ↗</a></p>'),
      'contacts':('Будьмо на зв’язку.','<p><a class="text-link" href="tel:+380972920104">+38 097 292 01 04</a></p><p>Україна, Дніпро, вул. М. Рильського, 106, 49116.</p><p>Понеділок–п’ятниця: 10:00–18:00. Субота та неділя — вихідні.</p><p>Для візиту домовтеся з нами заздалегідь.</p><p><a class="text-link" href="https://3dividruk.com.ua/ua/contacts">Контакти на Prom.ua ↗</a></p>'),
      'delivery':('Доставка та оплата.','<div class="notice">Тестовий сайт. Реальні замовлення приймає діючий магазин на Prom.ua.</div><h2>Підготовлені способи доставки</h2><p>Нова пошта — відділення або поштомат; Укрпошта — відділення; самовивіз у Дніпрі за попереднім погодженням. У тестовій формі адреса вводиться вручну. Вартість доставки — за тарифами перевізника; вона не включена у суму товарів.</p><h2>Оплата</h2><p>В окремому тестовому backend передбачена оплата при отриманні. Онлайн-еквайринг вимкнений до підключення власних реквізитів і перевірки. На цьому сайті гроші не списуються.</p><p>Чинні умови для покупок на Prom.ua: <a class="text-link" href="https://3dividruk.com.ua/ua/delivery_info">доставка та оплата ↗</a>.</p>'),
      'returns':('Повернення та обмін.','<div class="notice">На тестовій вітрині реальні покупки не здійснюються.</div><p>Повернення та обмін покупок у магазині на Prom.ua оформлюються за чинними умовами того магазину. Зверніться до продавця за номером <a href="tel:+380972920104">+38 097 292 01 04</a>.</p><p><a class="text-link" href="https://3dividruk.com.ua/ua/return_policy">Чинні умови повернення та обміну на Prom.ua ↗</a></p><p>Перед запуском незалежного магазину його реквізити та умови продажу мають бути перевірені власником.</p>'),
      'privacy':('Обробка даних.','<p>Цей сайт працює в тестовому режимі. Використовуйте вигадані дані при перевірці оформлення.</p><h2>Тестова вітрина на GitHub Pages</h2><p>Кошик зберігається локально у вашому браузері. Контактні дані з демонстраційної форми не надсилаються продавцю і не зберігаються цією програмою. Для очищення кошика видаліть товари або дані сайту у браузері.</p><h2>Окремий тестовий backend</h2><p>Якщо вітрина обслуговується окремим backend, тестові замовлення зберігаються у його власній базі. Доступ адміністратора захищений авторизацією. Успішне замовлення відображається лише у поточній сесії за приватним токеном.</p><h2>Зовнішні сервіси</h2><p>GitHub Pages як хостинг може обробляти технічні журнали запитів відповідно до власної політики. На сайті немає підключених рекламних пікселів BB610. Посилання на Prom.ua відкривають діючий магазин з його правилами обробки даних.</p><p>До запуску реальних продажів власник має затвердити реквізити, строки зберігання та остаточну політику конфіденційності.</p>')
    }
    for route,(title,content) in policies.items():
        (ROOT/(route+'.html')).write_text(shell(title,'policy',policy(title,content),route_name=route),encoding='utf-8')
    (ROOT/'404.html').write_text(shell('Сторінку не знайдено','policy',policy('Цієї сторінки ще немає.','<p><a class="btn" href="'+SITE+'catalog.html">Відкрити каталог ↗</a></p>'),route_name='404'),encoding='utf-8')
    urls=[SITE,SITE+'catalog.html']+[SITE+'products/'+p['id']+'/' for p in visible_products]
    (ROOT/'sitemap.xml').write_text('<?xml version="1.0" encoding="utf-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+''.join('<url><loc>'+xml(u)+'</loc></url>' for u in urls)+'</urlset>',encoding='utf-8')
    (ROOT/'robots.txt').write_text('User-agent: *\nDisallow: /\n# Preview only. Remove noindex/disallow after launch verification.\n',encoding='utf-8')
    (ROOT/'.nojekyll').write_text('',encoding='utf-8')
    assets=ROOT/'assets';assets.mkdir(exist_ok=True)
    (assets/'favicon.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#242821"/><text x="50" y="71" font-family="Arial" font-size="70" font-weight="bold" text-anchor="middle" fill="#faf8f3">3</text></svg>',encoding='utf-8')
    (assets/'placeholder.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#e7ebdd"/><text x="300" y="300" text-anchor="middle" font-family="Arial" font-size="28" fill="#687064">Фото уточнюється</text></svg>',encoding='utf-8')
    feeds=ROOT/'feeds';feeds.mkdir(exist_ok=True)
    rows=[]
    for p in visible_products:
        if not p.get('sku') or p.get('price') is None:continue
        rows.append({'id':p['commerceSku'],'title':p['title'],'description':p['description'][:5000],'link':SITE+'products/'+p['id']+'/','image_link':p['images'][0] if p['images'][0].startswith('https://') else SITE+p['images'][0],'availability':p['availability'],'price':str(p['price'])+' UAH','condition':'new','brand':'3DiViDruk','identifier_exists':'no'})
    fields=['id','title','description','link','image_link','availability','price','condition','brand','identifier_exists']
    stream=io.StringIO();writer=csv.DictWriter(stream,fieldnames=fields);writer.writeheader();writer.writerows(rows)
    for channel in ('google-merchant-draft','meta-catalog-draft'):(feeds/(channel+'.csv')).write_text(stream.getvalue(),encoding='utf-8-sig')
    (feeds/'status.json').write_text(json.dumps({'mode':'draft','readyForSubmission':False,'reason':'Preview noindex, offline catalog snapshot, no production backend/acquiring or domain cutover. Do not submit to Merchant/Meta.','products':len(rows)},indent=2),encoding='utf-8')
    redirects=[{'source':urlparse(p['sourceUrl']).path,'target':'/products/'+p['id']+'/','status':301} for p in products]
    (ROOT/'data/redirect-map.json').write_text(json.dumps(redirects,ensure_ascii=False,indent=2),encoding='utf-8')
    print(f'Built {len(products)} product records ({len(visible_products)} visible), {len(rows)} draft offers. Paused categories remain in the master catalog.')

if __name__=='__main__':build()
