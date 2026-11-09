/* One editor, one catalogue, three independently curated preview homepages. */
(()=>{'use strict';
 const $=q=>document.querySelector(q),all=q=>[...document.querySelectorAll(q)];
 const key='3dividruk_admin_draft_v1',backend=window.DIVIDRUK_COMMERCE_CONFIG?.checkoutMode==='backend';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const sectionLabels={categories:'Категорії',featured:'Добірка виробів',feature:'Акцентний блок',story:'Про майстерню',benefits:'Переваги'};
 let registry=[],catalog=[],taxonomy=[],defaults={},state=null,current='',dirty=false,token='';
 function copy(v){return JSON.parse(JSON.stringify(v))}
 function sku(p){return String(p.commerceSku||p.sku||'')}
 function draft(){try{const d=JSON.parse(localStorage.getItem(key)||'null');return d&&d.version===1&&d.products&&d.orders?d:{version:1,products:{},orders:{}}}catch{return {version:1,products:{},orders:{}}}}
 function report(t,cl=''){const node=$('#state');node.textContent=t;node.className='notice '+cl}
 async function api(path,options={}){
   const response=await fetch(path,{...options,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(options.body?{'Content-Type':'application/json'}:{})}});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.message||result.error?.message||'Помилка '+response.status);
   return result;
 }
 function cfg(){return registry.find(x=>x.id===current)}
 function available(){return catalog.filter(p=>p.storefront_visible!==false&&p.enabled!==false&&cfg()?.categories.includes(p.category))}
 function findProduct(s){return available().find(p=>sku(p)===s||p.sku===s)}
 function photo(p){const original=p?.images?.[0]||'assets/placeholder.svg';return /^https:\/\//.test(original)?original:'../'+original}
 function nested(obj,path){return path.split('.').reduce((value,key)=>value?.[key],obj)}
 function assign(obj,path,value){const keys=path.split('.');let target=obj;while(keys.length>1){const k=keys.shift();target=target[k]}target[keys[0]]=value}
 function collect(){if(!state)return;for(const el of all('[data-field]'))assign(state,el.dataset.field,el.value.trim());dirty=true}
 function productOptions(items,chosen){
   return items.map(p=>'<option value="'+esc(sku(p))+'" '+(sku(p)===chosen?'selected':'')+'>'+esc((p.sku||'')+' · '+p.title.slice(0,95))+'</option>').join('');
 }
 function renderFeatured(){
   const skus=state.featured.skus;
   $('#featured').innerHTML=skus.map((id,i)=>{
     const p=findProduct(id);if(!p)return '';
     return '<div class="home-item" data-feature="'+esc(id)+'"><img loading="lazy" src="'+esc(photo(p))+'" alt=""><div class="home-item-main"><strong>'+esc(p.title)+'</strong><small>'+esc(p.sku)+'</small></div><div class="home-item-controls">'
       +'<button type="button" data-up="'+i+'" '+(i===0?'disabled':'')+' aria-label="Вгору">↑</button>'
       +'<button type="button" data-down="'+i+'" '+(i===skus.length-1?'disabled':'')+' aria-label="Вниз">↓</button>'
       +'<button type="button" data-remove="'+esc(id)+'" class="secondary">Прибрати</button></div></div>';
   }).join('');
   const remaining=available().filter(p=>!skus.includes(sku(p)));
   $('#add-product').innerHTML=productOptions(remaining);
   $('#add').disabled=skus.length>=12||remaining.length===0;
 }
 function renderSections(){
   $('#sections').innerHTML=state.sections.map((id,i)=>'<div class="home-item"><div class="home-item-main"><strong>'+esc(sectionLabels[id]||id)+'</strong></div><div class="home-item-controls">'
      +'<button type="button" data-up="'+i+'" '+(i===0?'disabled':'')+'>↑</button><button type="button" data-down="'+i+'" '+(i===state.sections.length-1?'disabled':'')+'>↓</button></div></div>').join('');
 }
 function renderCovers(){
   const cats=cfg().categories;
   $('#covers').innerHTML=cats.map(cat=>{
     const c=taxonomy.find(x=>x.id===cat),items=available().filter(p=>p.category===cat);
     const p=items.find(p=>sku(p)===state.categories.covers[cat])||items[0];
     return '<div class="home-cover"><img src="'+esc(photo(p))+'" alt=""><strong>'+esc(c?.label||cat)+'</strong>'
       +'<label>Фото категорії<select data-cover="'+esc(cat)+'">'+productOptions(items,sku(p))+'</select></label></div>';
   }).join('');
 }
 function render(){
   $('#storefront').value=current;
   const sf=cfg(),visible=available();
   $('#scope').textContent=sf.proposedHostname+' · '+visible.length+' товарів · тестовий домен не підключений';
   $('#sf-choices').innerHTML=registry.map(x=>'<button type="button" data-store="'+esc(x.id)+'" class="'+(x.id===current?'active':'')+'">'
     +esc(x.shortName)+' <small>'+catalog.filter(p=>p.storefront_visible!==false&&x.categories.includes(p.category)).length+'</small></button>').join('');
   for(const el of all('[data-field]')){
     if(el.tagName==='SELECT'||el.id==='hero-product'||el.id==='feature-product'){
       el.innerHTML=productOptions(visible,nested(state,el.dataset.field));
       el.value=nested(state,el.dataset.field)??'';
     }else el.value=nested(state,el.dataset.field)??'';
   }
   $('#hero-image').src=photo(findProduct(state.hero.sku));
   renderCovers();renderFeatured();renderSections();
   $('#preview').href='../'+current+'/index.html'+(backend?'':'?editorPreview=1');
 }
 function validate(){
   if(!state||!cfg())throw Error('Не вибрано вітрину');
   const allSkus=new Set(available().map(sku));
   const choices=[state.hero.sku,state.feature.sku,...state.featured.skus,...Object.values(state.categories.covers)];
   if(choices.some(id=>!allSkus.has(id)))throw Error('Неприпустимий або прихований SKU у вибраній вітрині');
   if(!Array.isArray(state.featured.skus)||state.featured.skus.length<1||state.featured.skus.length>12||new Set(state.featured.skus).size!==state.featured.skus.length)throw Error('Добірка має містити 1–12 різних товарів');
   if(!Array.isArray(state.hero.titleLines)||state.hero.titleLines.length!==3||state.hero.titleLines.some(v=>!String(v).trim()||v.length>75))throw Error('Заголовок має складатися з трьох рядків');
   if(!Array.isArray(state.sections)||state.sections.length!==5||new Set(state.sections).size!==5||state.sections.some(x=>!sectionLabels[x]))throw Error('Неправильна послідовність блоків');
   if(Object.keys(state.categories.covers).sort().join('|')!==[...cfg().categories].sort().join('|'))throw Error('Неправильні обкладинки категорій');
   if(all('[data-field]').some(el=>el.maxLength>0&&el.value.length>el.maxLength))throw Error('Текст перевищує дозволену довжину');
 }
 function persist(){collect();validate();const d=draft();d.storefrontHomepages={...(d.storefrontHomepages||{}),[current]:copy(state)};localStorage.setItem(key,JSON.stringify(d));dirty=false}
 function change(id){if(!registry.some(x=>x.id===id))return;
   if(current&&dirty){try{persist()}catch(err){report('Не вдалося змінити вітрину: '+err.message,'warning');return}}
   current=id;state=copy(draft().storefrontHomepages?.[id]||defaults[id]);dirty=false;render();
   report('Редагуєте «'+cfg().shortName+'». Зміни залишаються локальними до перенесення в GitHub.','warning');
 }
 $('#save').onclick=async()=>{
   try{
     persist();
     if(backend){
       if(!token)throw Error('Увійдіть до адміністратора');
       await api('/api/v1/admin/storefront-homepages/'+encodeURIComponent(current),{method:'PATCH',body:JSON.stringify(state)});
       defaults[current]=copy(state);
       report('Налаштування «'+cfg().shortName+'» збережено на сервері.','ok');
     }else report('Чернетка «'+cfg().shortName+'» збережена в браузері. Для публікації експортуйте JSON.','ok');
   }catch(e){report('Не збережено: '+e.message,'warning')}
 };
 $('#export').onclick=()=>{
   try{persist();const d=draft();const payload={kind:'3dividruk-catalog-draft',createdAt:new Date().toISOString(),...d};
     const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),u=URL.createObjectURL(blob);
     const a=document.createElement('a');a.href=u;a.download='3dividruk-3-storefronts-draft.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1200);
     report('Експортовано спільний файл чернетки для трьох вітрин.','ok');
   }catch(e){report('Експорт не виконано: '+e.message,'warning')}
 };
 $('#storefront').onchange=e=>change(e.target.value);
 $('#sf-choices').onclick=e=>{const b=e.target.closest('[data-store]');if(b)change(b.dataset.store)};
 $('#editor').oninput=()=>{dirty=true};
 $('#hero-product').onchange=e=>{$('#hero-image').src=photo(findProduct(e.target.value));dirty=true};
 $('#covers').onchange=e=>{
   const el=e.target.closest('[data-cover]');if(!el)return;collect();
   const p=findProduct(el.value);if(!p||p.category!==el.dataset.cover)return;
   state.categories.covers[el.dataset.cover]=el.value;renderCovers();
 };
 $('#featured').onclick=e=>{
   const up=e.target.closest('[data-up]'),down=e.target.closest('[data-down]'),remove=e.target.closest('[data-remove]');
   if(!up&&!down&&!remove)return;collect();
   if(remove){state.featured.skus=state.featured.skus.filter(x=>x!==remove.dataset.remove)}
   else{const button=up||down,i=Number(button.dataset[up?'up':'down']),j=i+(up?-1:1);
     if(j>=0&&j<state.featured.skus.length)[state.featured.skus[i],state.featured.skus[j]]=[state.featured.skus[j],state.featured.skus[i]];
   }
   renderFeatured();
 };
 $('#sections').onclick=e=>{
   const up=e.target.closest('[data-up]'),down=e.target.closest('[data-down]');if(!up&&!down)return;collect();
   const button=up||down,i=Number(button.dataset[up?'up':'down']),j=i+(up?-1:1);
   if(j>=0&&j<state.sections.length)[state.sections[i],state.sections[j]]=[state.sections[j],state.sections[i]];
   renderSections();
 };
 $('#add').onclick=()=>{collect();const id=$('#add-product').value;if(findProduct(id)&&!state.featured.skus.includes(id)&&state.featured.skus.length<12){state.featured.skus.push(id);renderFeatured()}};
 $('#auth').onsubmit=async e=>{
   e.preventDefault();token=e.currentTarget.elements.token.value;
   try{await api('/api/v1/admin/settings');e.currentTarget.elements.token.value='';$('#auth').hidden=true;report('Авторизація пройшла успішно. Зміни можна зберігати на сервері.','ok')}
   catch(err){token='';report('Помилка входу: '+err.message,'warning')}
 };
 $('#menu').onclick=()=>document.body.classList.toggle('dividruk-menu-open');
 $('#overlay').onclick=()=>document.body.classList.remove('dividruk-menu-open');
 async function init(){try{
   const [registryResponse,homeResponse,catalogResponse]=await Promise.all([
     fetch(backend?'/api/v1/storefronts':'../data/storefronts.json'),
     fetch(backend?'/api/v1/storefront-homepages':'../data/storefront-homepages.json'),
     fetch(backend?'/api/v1/catalog':'../data/catalog.json')]);
   if(!registryResponse.ok||!homeResponse.ok||!catalogResponse.ok)throw Error('Не завантажено конфігурації');
   registry=(await registryResponse.json()).storefronts;defaults=(await homeResponse.json()).storefronts;
   const data=await catalogResponse.json();catalog=data.products;taxonomy=data.taxonomy||[];
   $('#storefront').innerHTML=registry.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.shortName)+'</option>').join('');
   const query=new URLSearchParams(location.search),requested=query.get('site');
   $('#auth').hidden=!backend;
   change(registry.some(x=>x.id===requested)?requested:'svitlo');
 }catch(e){report('Помилка завантаження вітрин: '+e.message,'warning')}}
 init();
})();