/* 3DiViDruk visual merchandising workbench.
 * GitHub Pages: browser-local drafts + explicit JSON export.
 * Independent backend: authenticated writes via admin API.
 * No GitHub access token or payment credentials in the browser.
 */
(() => {
 'use strict';
 const $=s=>document.querySelector(s);
 const config=window.DIVIDRUK_COMMERCE_CONFIG||{};
 const backend=config.checkoutMode==='backend';
 const key='3dividruk_admin_draft_v1';
 const money=n=>new Intl.NumberFormat('uk-UA',{style:'currency',currency:'UAH'}).format(Number(n||0));
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let token='',catalog=[],taxonomy=[],editing='',moving='',busy=false;
 let draft={version:1,products:{},orders:{}};
 const nav=document.getElementById('menu');
 nav.onclick=()=>document.body.classList.toggle('dividruk-menu-open');
 document.getElementById('overlay').onclick=()=>document.body.classList.remove('dividruk-menu-open');
 function status(message,variant=''){
   const e=$('#state');e.textContent=message;e.className='notice '+variant;
 }
 function tryLoadDraft(){
   try{const v=JSON.parse(localStorage.getItem(key)||'null');
     if(v&&v.version===1&&v.products&&v.orders) draft=v;
   }catch(e){status('Локальна чернетка недоступна: '+e.message,'warning')}
 }
 function saveDraft(){
   try{localStorage.setItem(key,JSON.stringify(draft));return true}
   catch(e){status('Чернетку не збережено: '+e.message,'warning');return false}
 }
 async function api(path,options={}){
   const r=await fetch(path,{...options,headers:{'Accept':'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...(token?{'Authorization':'Bearer '+token}:{})}});
   const payload=await r.json().catch(()=>({}));
   if(!r.ok) throw new Error(payload.message||payload.error?.message||'Помилка '+r.status);
   return payload;
 }
 const sku=p=>String(p.commerceSku||p.sku||'');
 const editable=()=>!backend||Boolean(token);
 const catSelect=$('#category'),subSelect=$('#subcategory'),search=$('#search');
 function groupKey(){return catSelect.value+'::'+(subSelect.value||'-')}
 function category(){return taxonomy.find(x=>x.id===catSelect.value)}
 function mandatorySubcategory(){return Boolean(category()?.subcategories?.length)}
 function orderable(){return editable()&&!busy&&!search.value.trim()&&(!mandatorySubcategory()||Boolean(subSelect.value))}
 function allScoped(){
   return catalog.filter(p=>p.category===catSelect.value&&(!subSelect.value||p.subcategory===subSelect.value));
 }
 function ordered(){
   const source=allScoped();
   const order=draft.orders[groupKey()];
   if(order&&(!backend)){
     const lookup=new Map(order.map((id,i)=>[id,i]));
     return source.sort((a,b)=>(lookup.get(sku(a))??(10000+catalog.indexOf(a)))-(lookup.get(sku(b))??(10000+catalog.indexOf(b))));
   }
   if(mandatorySubcategory()&&!subSelect.value){
     const categories=category().subcategories.map(c=>c.id);
     return source.sort((a,b)=>categories.indexOf(a.subcategory)-categories.indexOf(b.subcategory)||(a.sort_order??10000+catalog.indexOf(a))-(b.sort_order??10000+catalog.indexOf(b)));
   }
   return source.sort((a,b)=>(a.sort_order??10000+catalog.indexOf(a))-(b.sort_order??10000+catalog.indexOf(b)));
 }
 function image(p){
   const raw=(p.images||[])[0]||'assets/placeholder.svg';
   return /^https:\/\//.test(raw)?raw:'../'+String(raw).replace(/^\/|^\.\//g,'');
 }
 function refreshFilters(){
   const c=category();
   const old=subSelect.value;
   subSelect.innerHTML='<option value="">Усі підкатегорії</option>'+(c?.subcategories||[]).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.label)+'</option>').join('');
   if((c?.subcategories||[]).some(x=>x.id===old))subSelect.value=old;
   subSelect.hidden=!(c?.subcategories||[]).length;
   subSelect.disabled=subSelect.hidden;
 }
 function render(){
   const group=ordered(),q=search.value.trim().toLocaleLowerCase('uk');
   const visible=group.filter(p=>!q||(p.title+' '+sku(p)).toLocaleLowerCase('uk').includes(q));
   const allowed=orderable();
   $('#group-title').textContent=(category()?.label||'Каталог')+(subSelect.value?' / '+(category().subcategories.find(c=>c.id===subSelect.value)?.label||''):'');
   $('#count').textContent=visible.length+' позицій';
   $('#group-help').textContent=backend
     ? (editable()?'Зміни зберігаються на окремому сервері магазину.':'Увійдіть, щоб змінювати дані.')
     : 'Локальна чернетка: лише в цьому браузері. Для передачі змін у GitHub експортуйте JSON.';
   if(mandatorySubcategory()&&!subSelect.value)$('#group-help').textContent+=' Для зміни порядку виберіть підкатегорію.';
   if(q)$('#group-help').textContent+=' Очистіть пошук для зміни порядку.';
   $('#cards').innerHTML=visible.map((p,i)=>{
     const hidden=p.storefront_visible===false;
     const text=(p.description||'').replace(/\s+/g,' ').slice(0,160);
     return '<article class="studio-product" draggable="'+(allowed?'true':'false')+'" data-sku="'+esc(sku(p))+'">'
      +'<div class="visual"><img src="'+esc(image(p))+'" alt="'+esc(p.title)+'" loading="lazy">'
      +'<span class="order">№ '+(group.indexOf(p)+1)+'</span>'+(hidden?'<span class="paused">На паузі</span>':'')+'</div>'
      +'<div class="details"><span class="sku">'+esc(p.sku)+' · '+esc(p.subcategoryLabel||p.categoryLabel||'')+'</span>'
      +'<h3>'+esc(p.title)+'</h3><p>'+esc(text)+'</p><div class="price">'+money(p.price)+'</div></div>'
      +'<div class="controls"><button type="button" data-up="'+esc(sku(p))+'" aria-label="Підняти картку" '+(!allowed||group.indexOf(p)===0?'disabled':'')+'>↑</button>'
      +'<button type="button" data-down="'+esc(sku(p))+'" aria-label="Опустити картку" '+(!allowed||group.indexOf(p)===group.length-1?'disabled':'')+'>↓</button>'
      +'<button class="edit secondary" type="button" data-edit="'+esc(sku(p))+'" '+(editable()?'':'disabled')+'>Редагувати</button></div></article>';
   }).join('')||'<p class="empty-grid">У цій групі немає товарів.</p>';
   const params=new URLSearchParams({editorPreview:'1',category:catSelect.value});
   if(subSelect.value)params.set('subcategory',subSelect.value);
   $('#preview-link').href='../catalog.html?'+params.toString();
   $('#export').disabled=backend;
 }
 async function move(from,to){
   if(!orderable())return;
   const before=ordered().map(sku);
   const start=before.indexOf(from),end=before.indexOf(to);
   if(start<0||end<0||start===end)return;
   const next=[...before];next.splice(start,1);next.splice(end,0,from);
   busy=true;
   try{
     if(backend){
       await api('/api/v1/admin/catalog/order',{method:'PATCH',body:JSON.stringify({category:catSelect.value,subcategory:subSelect.value||null,skus:next})});
       next.forEach((id,rank)=>{const p=catalog.find(x=>sku(x)===id);if(p)p.sort_order=rank});
       status('Порядок '+next.length+' товарів збережено на сервері.','ok');
     }else{
       draft.orders[groupKey()]=next;
       if(saveDraft())status('Порядок збережено в локальній чернетці. Експортуйте JSON для публікації.','ok');
     }
   }catch(e){status('Помилка збереження порядку: '+e.message,'warning')}
   finally{busy=false;render()}
 }
 const grid=$('#cards');
 grid.addEventListener('click',e=>{
   const edit=e.target.closest('[data-edit]'),up=e.target.closest('[data-up]'),down=e.target.closest('[data-down]');
   if(edit)return openEdit(edit.dataset.edit);
   if(up||down){
     const id=(up||down).dataset[up?'up':'down'];
     const ids=ordered().map(sku),i=ids.indexOf(id);
     const j=i+(up?-1:1);if(j>=0&&j<ids.length)move(id,ids[j]);
   }
 });
 grid.addEventListener('dragstart',e=>{
   if(!orderable()){e.preventDefault();return}
   const card=e.target.closest('.studio-product');if(!card)return;
   moving=card.dataset.sku;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',moving);card.classList.add('dragging');
 });
 grid.addEventListener('dragover',e=>{if(!moving||!orderable())return;const c=e.target.closest('.studio-product');if(c){e.preventDefault();e.dataTransfer.dropEffect='move';c.classList.add('drag-over')}});
 grid.addEventListener('dragleave',e=>{const c=e.target.closest('.studio-product');if(c)c.classList.remove('drag-over')});
 grid.addEventListener('drop',e=>{const c=e.target.closest('.studio-product');if(!c||!moving)return;e.preventDefault();const from=moving;moving='';move(from,c.dataset.sku)});
 grid.addEventListener('dragend',()=>{moving='';grid.querySelectorAll('.drag-over,.dragging').forEach(e=>e.classList.remove('drag-over','dragging'))});
 function openEdit(id){
   if(!editable())return;
   const p=catalog.find(x=>sku(x)===id);if(!p)return;
   editing=id;const form=$('#edit-form');
   form.elements.title.value=p.title||'';
   form.elements.description.value=p.description||'';
   form.elements.price.value=p.price??'';
   $('#edit-sku').textContent=p.sku+(p.storefront_visible===false?' · приховано':'');
   $('#edit-error').textContent='';
   $('#edit-dialog').showModal();
 }
 $('#close-edit').onclick=()=>$('#edit-dialog').close();
 $('#cancel-edit').onclick=()=>$('#edit-dialog').close();
 $('#edit-form').onsubmit=async e=>{
   e.preventDefault();
   if(!editable()||!editing)return;
   const f=e.currentTarget,body={title:f.elements.title.value.trim(),description:f.elements.description.value,price:Number(f.elements.price.value)};
   if(!body.title||!Number.isFinite(body.price)||body.price<=0){$('#edit-error').textContent='Перевірте назву та ціну';return}
   try{
     const p=catalog.find(x=>sku(x)===editing);
     if(backend)await api('/api/v1/admin/catalog/'+encodeURIComponent(editing),{method:'PATCH',body:JSON.stringify(body)});
     else{draft.products[editing]={...(draft.products[editing]||{}),...body};if(!saveDraft())return}
     Object.assign(p,body);$('#edit-dialog').close();status(backend?'Зміни товару збережено на сервері.':'Зміни збережено в локальній чернетці.','ok');render();
   }catch(err){$('#edit-error').textContent=err.message}
 };
 $('#export').onclick=()=>{
   const payload={kind:'3dividruk-catalog-draft',version:1,createdAt:new Date().toISOString(),...draft};
   const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
   const link=document.createElement('a'),uri=URL.createObjectURL(blob);
   link.href=uri;link.download='3dividruk-catalog-draft.json';document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(uri),1000);
 };
 catSelect.onchange=()=>{refreshFilters();search.value='';render()};
 subSelect.onchange=render;
 search.oninput=render;
 $('#auth').onsubmit=async e=>{
   e.preventDefault();const field=e.currentTarget.elements.token;token=field.value;
   try{await api('/api/v1/admin/settings');field.value='';$('#auth').hidden=true;status('Вхід успішний. Зміни записуються до приватної бази 3DiViDruk.','ok');render()}
   catch(err){token='';status('Авторизація не вдалася: '+err.message,'warning')}
 };
 async function load(){
   tryLoadDraft();
   try{
     const data=await api(backend?'/api/v1/catalog':'../data/catalog.json');
     catalog=Array.isArray(data)?data:data.products||[];
     taxonomy=(data.taxonomy||[]).filter(c=>!c.paused&&catalog.some(p=>p.category===c.id));
     if(!backend){
       catalog=catalog.map(p=>({...p,...(draft.products[sku(p)]||{})}));
     }
     catSelect.innerHTML=taxonomy.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.label)+'</option>').join('');
     refreshFilters();
     $('#auth').hidden=!backend;
     status(backend?'Вітрина завантажена. Увійдіть для збереження.':'Режим чернетки. Публічний магазин не змінюється автоматично.','warning');
     render();
   }catch(err){status('Не вдалося завантажити редактор: '+err.message,'warning')}
 }
 load();
})();
