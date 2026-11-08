/* 3DiViDruk media editor: select covers and reorder existing photos only. */
(()=>{'use strict';
 const $=s=>document.querySelector(s),cfg=window.DIVIDRUK_COMMERCE_CONFIG||{},backend=cfg.checkoutMode==='backend',key='3dividruk_admin_draft_v1';
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let products=[],taxonomy=[],selected=null,images=[],token='',dirty=false,locked=false;
 function sku(p){return String(p.commerceSku||p.sku||'')}
 function draft(){try{const d=JSON.parse(localStorage.getItem(key)||'null');return d?.version===1&&d.products&&d.orders?d:null}catch{return null}}
 function msg(text,type=''){const s=$('#state');s.textContent=text;s.className='notice '+type}
 function url(raw){return /^https:\/\//.test(raw)?raw:'../'+String(raw).replace(/^\/|^\.\//,'')}
 function compare(a,b){return Array.isArray(a)&&a.length===b.length&&new Set(a).size===a.length&&a.every(x=>b.includes(x))}
 function savedImages(p){const original=p.images||[],other=draft()?.products?.[sku(p)]?.images;return !backend&&compare(other,original)?other:original}
 async function api(path,opt={}){const r=await fetch(path,{...opt,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(opt.body?{'Content-Type':'application/json'}:{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.message||data.error?.message||'HTTP '+r.status);return data}
 function listProducts(){
   const q=$('#search').value.toLocaleLowerCase('uk').trim(),cat=$('#category').value;
   const list=products.filter(p=>(!cat||p.category===cat)&&(!q||(p.title+' '+p.sku).toLocaleLowerCase('uk').includes(q)));
   $('#product-count').textContent='Знайдено '+list.length+' · показано '+Math.min(80,list.length);
   $('#products').innerHTML=list.slice(0,80).map(p=>'<button class="media-product '+(p===selected?'active':'')+'" type="button" data-product="'+esc(sku(p))+'">'
     +'<img src="'+esc(url(savedImages(p)[0]||'assets/placeholder.svg'))+'" alt="" loading="lazy"><span><strong>'+esc(p.title)+'</strong><small>'+esc(p.sku||sku(p))
     +(p.storefront_visible===false?' · На паузі':'')+'</small></span></button>').join('')||'<p class="media-empty">Не знайдено товарів.</p>';
 }
 function render(){
   if(!selected)return;
   $('#product-sku').textContent=(selected.sku||sku(selected))+(selected.storefront_visible===false?' · ТОВАР НА ПАУЗІ':'');
   $('#product-title').textContent=selected.title;
   $('#photo-count').textContent=images.length+' фотографій · обкладинка — № 1';
   $('#cover').src=url(images[0]||'assets/placeholder.svg');
   $('#cover').alt=selected.title+' — обкладинка';
   $('#product-view').href='../products/'+encodeURIComponent(selected.id)+'/'+(!backend?'?editorPreview=1':'');
   $('#gallery').innerHTML=images.map((img,i)=>'<article class="media-photo" data-index="'+i+'">'
     +'<img src="'+esc(url(img))+'" alt="Фото '+(i+1)+'" loading="lazy">'
     +'<strong>'+(i===0?'Головне фото':'Фото № '+(i+1))+'</strong><div class="file">'+esc(img.split('/').pop())+'</div>'
     +'<div class="controls"><button type="button" data-cover="'+i+'" '+(i===0?'disabled':'')+'>На обкладинку</button>'
     +'<button type="button" data-up="'+i+'" '+(i===0?'disabled':'')+' aria-label="Фото вгору">↑</button>'
     +'<button type="button" data-down="'+i+'" '+(i===images.length-1?'disabled':'')+' aria-label="Фото вниз">↓</button></div></article>').join('');
   $('#save').disabled=backend&&!token;
 }
 function choose(id){
   const p=products.find(p=>sku(p)===id);if(!p)return;
   if(dirty&&backend&&!window.confirm('Порядок фото не збережено. Перейти до іншого товару?'))return;
   selected=p;images=[...savedImages(p)];dirty=false;render();listProducts();
 }
 function localSave(){
   if(!selected)return false;
   if(!compare(images,selected.images||[]))throw Error('Можна лише змінювати порядок уже завантажених фотографій');
   const d=draft()||{version:1,products:{},orders:{}};
   d.products[sku(selected)]={...(d.products[sku(selected)]||{}),images:[...images]};
   localStorage.setItem(key,JSON.stringify(d));
   dirty=false;return true;
 }
 async function save(){
   if(locked||!selected)return;
   try{
     locked=true;$('#save').disabled=true;
     if(!compare(images,selected.images||[]))throw Error('Список фото не збігається з оригіналами');
     if(backend){
       if(!token)throw Error('Спочатку увійдіть до адміністратора');
       await api('/api/v1/admin/catalog/'+encodeURIComponent(sku(selected)),{method:'PATCH',body:JSON.stringify({images})});
       selected.images=[...images];dirty=false;msg('Порядок фото збережено у базі 3DiViDruk.','ok');
     }else{localSave();msg('Фото збережені лише в локальній чернетці. Експортуйте JSON для публікації.','ok')}
     listProducts();
   }catch(e){msg('Не вдалося зберегти фото: '+e.message,'warning')}
   finally{locked=false;$('#save').disabled=backend&&!token}
 }
 function setOrder(list){
   images=list;dirty=true;render();
   if(!backend){try{localSave();msg('Порядок фото змінено в локальній чернетці.','ok')}catch(e){msg(e.message,'warning')}}
   else msg('Порядок фото змінено. Натисніть «Зберегти».','warning');
   listProducts();
 }
 $('#gallery').addEventListener('click',e=>{
   const cover=e.target.closest('[data-cover]'),up=e.target.closest('[data-up]'),down=e.target.closest('[data-down]');
   if(!cover&&!up&&!down)return;
   const button=cover||up||down,index=Number(button.dataset[cover?'cover':up?'up':'down']);
   if(!Number.isInteger(index)||index<0||index>=images.length)return;
   const next=[...images];
   if(cover){const moved=next.splice(index,1)[0];next.unshift(moved)}
   else{const j=index+(up?-1:1);if(j<0||j>=next.length)return;[next[index],next[j]]=[next[j],next[index]]}
   setOrder(next);
 });
 $('#products').onclick=e=>{const b=e.target.closest('[data-product]');if(b)choose(b.dataset.product)};
 $('#search').oninput=listProducts;$('#category').onchange=listProducts;
 $('#save').onclick=save;
 $('#export').onclick=()=>{
   if(backend){msg('Експорт доступний у локальному режимі чернетки.','warning');return}
   try{
     if(dirty)localSave();
     const d=draft()||{version:1,products:{},orders:{}};
     const payload={kind:'3dividruk-catalog-draft',createdAt:new Date().toISOString(),...d};
     const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),link=document.createElement('a'),object=URL.createObjectURL(blob);
     link.href=object;link.download='3dividruk-media-draft.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(object),1000);
     msg('Чернетку експортовано. Оригінальні фото залишилися в каталозі.','ok');
   }catch(e){msg('Експорт не виконано: '+e.message,'warning')}
 };
 $('#menu').onclick=()=>document.body.classList.toggle('dividruk-menu-open');
 $('#overlay').onclick=()=>document.body.classList.remove('dividruk-menu-open');
 $('#auth').onsubmit=async e=>{
   e.preventDefault();token=e.currentTarget.elements.token.value;
   try{await api('/api/v1/admin/settings');e.currentTarget.elements.token.value='';$('#auth').hidden=true;msg('Вхід виконано. Фото можна зберігати в окремій базі.','ok');render()}
   catch(err){token='';msg('Помилка входу: '+err.message,'warning')}
 };
 async function init(){
   try{
     const data=await api(backend?'/api/v1/catalog':'../data/catalog.json');
     products=Array.isArray(data)?data:data.products||[];taxonomy=data.taxonomy||[];
     $('#category').innerHTML='<option value="">Усі категорії</option>'+taxonomy.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.label)+(c.paused?' · на паузі':'')+'</option>').join('');
     $('#auth').hidden=!backend;
     choose(sku(products.find(p=>p.storefront_visible!==false)||products[0]));
     msg(backend?'Медіатека готова. Увійдіть для збереження на сервері.':'Медіатека готова. Фото змінюються лише в локальному чернетковому режимі.','warning');
   }catch(e){msg('Не вдалося завантажити медіатеку: '+e.message,'warning')}
 }
 init();
})();