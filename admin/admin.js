/* Adapted BB610 admin request, escaping, status, order-view and shell patterns.
   No credentials, remembered API URLs or external integrations are inherited. */
(()=>{
 'use strict';
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 const config=window.DIVIDRUK_COMMERCE_CONFIG||{},preview=config.checkoutMode!=='backend';
 let token='',catalog=[],orders=[],editingSku='',activeTab='catalog';
 const money=n=>new Intl.NumberFormat('uk-UA',{style:'currency',currency:'UAH'}).format(Number(n||0));
 function esc(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
 const statusName=v=>({new:'Новий',confirmed:'Підтверджено',preparing:'Комплектується',shipped:'Відправлено',completed:'Виконано',cancelled:'Скасовано'}[v]||v);
 const transitions={new:['confirmed','cancelled'],confirmed:['new','preparing','cancelled'],preparing:['confirmed','shipped','cancelled'],shipped:['preparing','completed'],completed:[],cancelled:[]};
 const stockName=p=>p.storefront_visible===false?'На паузі · приховано':({in_stock:'В наявності',out_of_stock:'Немає в наявності',preorder:'Під замовлення'}[p.availability]||p.availability||'Уточнюється');
 async function req(path,opt={}){
   const c=new AbortController(),t=setTimeout(()=>c.abort(),12000);
   try{
     const r=await fetch(path,{...opt,signal:c.signal,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(opt.body?{'Content-Type':'application/json'}:{}),...opt.headers}});
     const data=await r.json().catch(()=>({}));
     if(!r.ok)throw new Error(data.message||data.error?.message||`Помилка ${r.status}`);
     return data;
   } finally{clearTimeout(t)}
 }
 function notice(message){$('#notice').textContent=message}
 function image(p){const raw=(p.images||p.imageUrls||[])[0]||p.image||'';const value=typeof raw==='object'?(raw.localPath||raw.url||raw.src):raw;if(!value)return '';if(/^https:\/\//.test(value))return value;return '../'+String(value).replace(/^\.\//,'').replace(/^\//,'')}
 async function loadCatalog(){
   try{
     const data=preview?await req('../data/catalog.json'):await req('/api/v1/catalog');
     catalog=Array.isArray(data)?data:data.products||[];renderCatalog();
   }catch(e){notice(e.message)}
 }
 function renderCatalog(){
   const q=$('#search').value.trim().toLowerCase(),list=catalog.filter(p=>!q||[p.title||p.name,p.sku].join(' ').toLowerCase().includes(q));
   $('#count').textContent=`${list.length} товарів`;
   $('#catalog-rows').innerHTML=list.map(p=>`<tr><td><div class="product-cell">${image(p)?`<img src="${esc(image(p))}" alt="" loading="lazy">`:''}<span>${esc(p.title||p.name)}</span></div></td><td>${esc(p.sku)}${p.commerceSku!==p.sku?`<div class="muted">${esc(p.commerceSku)}</div>`:''}</td><td>${money(p.price)}</td><td><span class="pill">${esc(stockName(p))}</span></td><td><button class="secondary" data-edit="${esc(p.commerceSku||p.sku)}" ${preview||!token?'disabled':''}>Змінити</button></td></tr>`).join('');
   $$('[data-edit]').forEach(b=>b.onclick=()=>editProduct(b.dataset.edit));
 }
 function editProduct(sku){
   const p=catalog.find(p=>(p.commerceSku||p.sku)===sku);if(!p)return;editingSku=sku;
   const f=$('#product-form');f.elements.title.value=p.title||p.name||'';f.elements.price.value=p.price;f.elements.availability.value=p.availability==='out_of_stock'?'out_of_stock':p.availability==='preorder'?'preorder':'in_stock';f.elements.stock_qty.value=p.stock_qty??'';f.elements.description.value=p.description||p.descriptionText||'';f.elements.enabled.checked=p.enabled!==false;$('#edit-sku').textContent=sku;$('#product-error').textContent='';$('#product-dialog').showModal();
 }
 $('#product-form').onsubmit=async e=>{
   e.preventDefault();const f=e.currentTarget;
   const body={title:f.elements.title.value.trim(),price:Number(f.elements.price.value),availability:f.elements.availability.value,stock_qty:f.elements.stock_qty.value===''?null:Number(f.elements.stock_qty.value),description:f.elements.description.value,enabled:f.elements.enabled.checked};
   try{await req('/api/v1/admin/catalog/'+encodeURIComponent(editingSku),{method:'PATCH',body:JSON.stringify(body)});$('#product-dialog').close();await loadCatalog();notice('Зміни товару збережено в окремій базі 3DiViDruk.')}catch(e){$('#product-error').textContent=e.message}
 };
 async function loadOrders(){
   if(preview||!token){$('#orders').textContent='Замовлення доступні після входу на окремому сервері магазину.';return}
   try{orders=(await req('/api/v1/admin/orders')).orders||[];$('#order-summary').textContent=`${orders.length} замовлень`;$('#orders').innerHTML=orders.length?orders.map(o=>`<article class="order-row" tabindex="0" role="button" data-order="${esc(o.order_id)}"><div><b>${esc(o.order_number)}</b><div class="muted">${new Date(o.created_at).toLocaleString('uk-UA')}${o.test_order?' · Тестове':''}</div></div><div>${esc(o.customer.name)}<div class="muted">${esc(o.customer.phone)}</div></div><span class="pill">${esc(statusName(o.status))}</span><b>${money(o.total)}</b></article>`).join(''):'<div class="card">Замовлень поки немає.</div>';$$('[data-order]').forEach(b=>{b.onclick=()=>openOrder(b.dataset.order);b.onkeydown=e=>{if(e.key==='Enter')openOrder(b.dataset.order)}})}catch(e){notice(e.message)}
 }
 function openOrder(id){
   const o=orders.find(x=>x.order_id===id);if(!o)return;
   $('#order-title').textContent=o.order_number;
   $('#order-detail').innerHTML=`<div class="card"><b>${esc(o.customer.name)}</b><div>${esc(o.customer.phone)}</div><div>${esc(o.customer.email)}</div>${o.test_order?'<p class="pill">Тестове замовлення — без оплати</p>':''}</div><div class="card"><h3>Товари</h3>${o.items.map(i=>`<div class="detail-line"><div>${esc(i.name)}<div class="muted">${esc(i.sku)}</div></div><div>${i.quantity} × ${money(i.unit_price)}<br><b>${money(i.line_total)}</b></div></div>`).join('')}<p><b>Разом за товари: ${money(o.total)}</b><br>Доставка: за тарифами перевізника.</p></div><div class="card"><h3>Доставка та оплата</h3><div>${esc(o.fulfillment.provider)} · ${esc(o.fulfillment.service)}</div><div>${esc([o.fulfillment.city,o.fulfillment.branch,o.fulfillment.address_line].filter(Boolean).join(' · '))}</div><div>Післяплата · очікується</div><p>${esc(o.comment)}</p></div><form id="status-form" class="card"><h3>Статус: ${esc(statusName(o.status))}</h3><label>Новий статус<select name="status"><option value="${esc(o.status)}">${esc(statusName(o.status))}</option>${(transitions[o.status]||[]).map(s=>`<option value="${s}">${statusName(s)}</option>`).join('')}</select></label><label>ТТН, створена окремо<input name="tracking_number" maxlength="100" value="${esc(o.tracking_number||'')}"></label><label>Нотатка до зміни<input name="note" maxlength="1000"></label><button>Зберегти</button><p id="status-error" role="alert"></p></form><div class="card"><h3>Історія</h3>${o.history.map(h=>`<div class="detail-line"><span>${esc(h.from_status?statusName(h.from_status):'—')} → ${esc(statusName(h.to_status))}<br>${esc(h.note)}</span><span class="muted">${new Date(h.created_at).toLocaleString('uk-UA')}</span></div>`).join('')}</div>`;
   $('#status-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;try{const updated=await req('/api/v1/admin/orders/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({status:f.elements.status.value,note:f.elements.note.value,tracking_number:f.elements.tracking_number.value})});orders=orders.map(x=>x.order_id===id?updated:x);openOrder(id);await loadOrders()}catch(e){$('#status-error').textContent=e.message}};
   if(!$('#order-dialog').open)$('#order-dialog').showModal();
 }
 async function loadSettings(){
   const panel=$('#settings');if(preview||!token){panel.innerHTML='<h2>Оплата та доставка</h2><p>Післяплата, Нова пошта, Укрпошта та самовивіз підготовлені в окремому backend. Онлайн-оплата й створення ТТН вимкнені.</p><p>Налаштування доступні після входу на сервері магазину.</p>';return}
   try{const s=await req('/api/v1/admin/settings');panel.innerHTML=`<h2>Оплата та доставка</h2><p><b>${s.test_mode?'Тестовий режим. Усі замовлення позначаються тестовими.':'Режим приймання замовлень.'}</b></p><p>Післяплата · доставка за тарифами перевізника · онлайн-оплата вимкнена.</p><p>Нова пошта, Укрпошта, самовивіз. ТТН додається вручну.</p><label class="check"><input id="checkout-enabled" type="checkbox" ${s.checkout_enabled?'checked':''}> Приймати замовлення після завершення тестування</label><p class="muted">Зміна діє лише коли тестовий режим вимкнено в оточенні сервера.</p><button id="save-settings">Зберегти</button>`;$('#save-settings').onclick=async()=>{try{await req('/api/v1/admin/settings',{method:'PATCH',body:JSON.stringify({checkout_enabled:$('#checkout-enabled').checked})});notice('Налаштування збережено.')}catch(e){notice(e.message)}}}catch(e){notice(e.message)}
 }
 function showTab(tab){activeTab=tab;const names={catalog:'Каталог',orders:'Замовлення',settings:'Оплата та доставка'};$('#page-title').textContent=names[tab];Object.keys(names).forEach(name=>$(`#${name}-panel`).hidden=name!==tab);$$('[data-tab]').forEach(a=>a.classList.toggle('active',a.dataset.tab===tab));document.body.classList.remove('dividruk-menu-open');if(tab==='orders')loadOrders();if(tab==='settings')loadSettings()}
 $$('[data-tab]').forEach(a=>a.onclick=e=>{e.preventDefault();showTab(a.dataset.tab)});$$('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
 $('#menu').onclick=()=>document.body.classList.toggle('dividruk-menu-open');$('#overlay').onclick=()=>document.body.classList.remove('dividruk-menu-open');$('#search').oninput=renderCatalog;$('#reload').onclick=loadCatalog;
 $('#login-form').onsubmit=async e=>{e.preventDefault();token=$('#token').value;try{await req('/api/v1/admin/settings');$('#token').value='';$('#login').hidden=true;$('#logout').hidden=false;notice('Вхід виконано. Зміни зберігаються лише у 3DiViDruk.');renderCatalog();showTab(activeTab)}catch(e){token='';notice(e.message)}};
 $('#logout').onclick=()=>{token='';orders=[];$('#order-dialog').close();$('#product-dialog').close();$('#login').hidden=false;$('#logout').hidden=true;notice('Ви вийшли з керування магазином.');showTab('catalog');renderCatalog()};
 $('#login').hidden=preview;notice(preview?'Перегляд адмінки. Для зміни товарів, замовлень і налаштувань потрібен окремий сервер магазину.':'Окремий сервер 3DiViDruk. Увійдіть для керування.');showTab('catalog');loadCatalog();
})();
