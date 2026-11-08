/* 3DiViDruk homepage manager: local editorial drafts on GitHub Pages; secure backend writes later. */
(()=>{'use strict';
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 const cfg=window.DIVIDRUK_COMMERCE_CONFIG||{},backend=cfg.checkoutMode==='backend',key='3dividruk_admin_draft_v1';
 const labels={categories:'Категорії',featured:'Вибрані вироби',feature:'Акцентний блок',story:'Про майстерню',benefits:'Переваги'};
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let catalog=[],taxonomy=[],base=null,state=null,token='',saving=false;
 const $status=$('#state');
 function notice(t,style=''){ $status.textContent=t;$status.className='notice '+style }
 function clone(x){return JSON.parse(JSON.stringify(x))}
 function draft(){try{const d=JSON.parse(localStorage.getItem(key)||'null');return d&&d.version===1&&d.products&&d.orders?d:null}catch{return null}}
 function persist(){const d=draft()||{version:1,products:{},orders:{}};d.homepage=clone(state);localStorage.setItem(key,JSON.stringify(d))}
 function sku(p){return String(p.commerceSku||p.sku||'')}
 const allowed=p=>p.storefront_visible!==false&&p.enabled!==false;
 const active=()=>catalog.filter(allowed);
 const item=id=>active().find(p=>sku(p)===id||p.sku===id);
 function photo(p){let im=p?.images?.[0]||'assets/placeholder.svg';const override=p?draft()?.products?.[sku(p)]?.images:null;if(Array.isArray(override)&&override.length&&p.images.includes(override[0]))im=override[0];return /^https:\/\//.test(im)?im:'../'+im.replace(/^\/|^\.\//,'')}
 function productsSelect(id,group='',selected=''){
   const filtered=active().filter(p=>!group||p.category===group);
   const el=$('#'+id);el.innerHTML=filtered.map(p=>'<option value="'+esc(sku(p))+'">'+esc(p.sku+' · '+p.title.slice(0,95))+'</option>').join('');
   if(filtered.some(p=>sku(p)===selected))el.value=selected;
 }
 function setNested(o,path,value){const fields=path.split('.');let target=o;while(fields.length>1){const k=fields.shift();if(!target[k]||typeof target[k]!=='object')target[k]={};target=target[k]}target[fields[0]]=value}
 function getNested(o,path){return path.split('.').reduce((v,k)=>v?.[k],o)}
 function collect(){for(const input of $$('[data-field]')){if(input.dataset.field.endsWith('.sku')){if(!item(input.value))continue}setNested(state,input.dataset.field,input.value.trim())}}
 function renderFeatured(){
   const el=$('#featured-list'),ids=state.featured.skus;
   el.innerHTML=ids.map((id,i)=>{const p=item(id);if(!p)return '';
     return '<div class="home-item" data-featured="'+esc(id)+'"><img src="'+esc(photo(p))+'" alt="" loading="lazy"><div class="home-item-main"><strong>'+esc(p.title)+'</strong><small>'+esc(p.sku)+'</small></div><div class="home-item-controls">'
     +'<button type="button" data-move-feature="'+i+':-1" '+(i===0?'disabled':'')+' aria-label="Вгору">↑</button>'
     +'<button type="button" data-move-feature="'+i+':1" '+(i===ids.length-1?'disabled':'')+' aria-label="Вниз">↓</button>'
     +'<button type="button" data-remove-feature="'+esc(id)+'" class="secondary">Прибрати</button></div></div>';
   }).join('');
   const choices=active().filter(p=>!ids.includes(sku(p)));
   $('#featured-add').innerHTML=choices.map(p=>'<option value="'+esc(sku(p))+'">'+esc(p.sku+' · '+p.title.slice(0,100))+'</option>').join('');
   $('#featured-add-button').disabled=!choices.length||ids.length>=12;
 }
 function renderSections(){
   $('#sections-list').innerHTML=state.sections.map((id,i)=>'<div class="home-item home-section-card"><div class="home-item-main"><strong>'+esc(labels[id]||id)+'</strong></div><div class="home-item-controls">'
     +'<button type="button" data-move-section="'+i+':-1" '+(i===0?'disabled':'')+' aria-label="Вгору">↑</button>'
     +'<button type="button" data-move-section="'+i+':1" '+(i===state.sections.length-1?'disabled':'')+' aria-label="Вниз">↓</button></div></div>').join('');
 }
 function renderCovers(){
   $('#category-covers').innerHTML=taxonomy.filter(c=>!c.paused&&active().some(p=>p.category===c.id)).map(c=>{
     const relevant=active().filter(p=>p.category===c.id);
     const p=relevant.find(x=>sku(x)===state.categories.covers[c.id])||relevant[0];
     const options=relevant.map(x=>'<option value="'+esc(sku(x))+'" '+(sku(x)===sku(p)?'selected':'')+'>'+esc(x.sku+' · '+x.title.slice(0,60))+'</option>').join('');
     return '<div class="home-cover"><img src="'+esc(photo(p))+'" alt="" loading="lazy"><strong>'+esc(c.label)+'</strong><label>Товар на обкладинці<select data-cover="'+esc(c.id)+'">'+options+'</select></label></div>';
   }).join('');
 }
 function render(){
   for(const input of $$('[data-field]'))input.value=getNested(state,input.dataset.field)??'';
   productsSelect('hero-product','',state.hero.sku);
   productsSelect('feature-product','',state.feature.sku);
   const hp=item(state.hero.sku);$('#hero-photo').src=photo(hp);
   renderFeatured();renderSections();renderCovers();
   $('#export').disabled=backend;$('#reset').disabled=saving;
 }
 function validate(){
   const required=['hero.sku','feature.sku','hero.description','categories.title','featured.title','feature.title','story.title'];
   if(required.some(path=>!String(getNested(state,path)||'').trim()))throw Error('Заповніть обов’язкові тексти та оберіть товари');
   if(!Array.isArray(state.hero.titleLines)||state.hero.titleLines.length!==3||state.hero.titleLines.some(v=>!String(v).trim()))throw Error('Заголовок першого екрану має три заповнені рядки');
   const values=[state.hero.sku,state.feature.sku,...state.featured.skus,...Object.values(state.categories.covers)];
   if(values.some(id=>!item(id)))throw Error('У вибраних товарах є відсутній або прихований виріб');
   if(state.featured.skus.length<1||state.featured.skus.length>12||new Set(state.featured.skus).size!==state.featured.skus.length)throw Error('У добірці має бути 1–12 різних виробів');
   const allowed=Object.keys(labels);if(state.sections.length!==allowed.length||new Set(state.sections).size!==allowed.length||state.sections.some(id=>!allowed.includes(id)))throw Error('Перевірте список блоків');
   if([...$$('[data-field]')].some(el=>el.value.length>Number(el.maxLength||30000)&&el.maxLength>0))throw Error('Текст перевищує допустиму довжину');
 }
 async function api(path,opts={}){const r=await fetch(path,{...opts,headers:{Accept:'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(opts.body?{'Content-Type':'application/json'}:{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.message||d.error?.message||'HTTP '+r.status);return d}
 async function save(){
   if(saving)return;collect();
   try{validate();saving=true;$('#save').disabled=true;$('#save-bottom').disabled=true;
     if(backend){if(!token)throw Error('Увійдіть до адмінки');await api('/api/v1/admin/homepage',{method:'PATCH',body:JSON.stringify(state)});base=clone(state);notice('Налаштування головної збережено на сервері.','ok')}
     else{persist();notice('Чернетку головної збережено лише в цьому браузері. Відкрийте попередній перегляд або експортуйте JSON.','ok')}
   }catch(e){notice('Не вдалося зберегти: '+e.message,'warning')}
   finally{saving=false;$('#save').disabled=false;$('#save-bottom').disabled=false}
 }
 function modifyArray(arr,index,direction){const j=index+direction;if(!Number.isInteger(index)||!Number.isInteger(direction)||j<0||j>=arr.length)return;[arr[index],arr[j]]=[arr[j],arr[index]]}
 $('#featured-list').addEventListener('click',e=>{
   const move=e.target.closest('[data-move-feature]'),remove=e.target.closest('[data-remove-feature]');
   if(!move&&!remove)return;collect();
   if(move){const [i,step]=move.dataset.moveFeature.split(':').map(Number);modifyArray(state.featured.skus,i,step)}
   else state.featured.skus=state.featured.skus.filter(id=>id!==remove.dataset.removeFeature);
   renderFeatured();if(!backend){persist();notice('Порядок добірки записано в локальну чернетку.','ok')}else notice('Натисніть «Зберегти», щоб записати зміни на сервер.');
 });
 $('#sections-list').addEventListener('click',e=>{
   const b=e.target.closest('[data-move-section]');if(!b)return;collect();
   const [i,step]=b.dataset.moveSection.split(':').map(Number);modifyArray(state.sections,i,step);
   renderSections();if(!backend){persist();notice('Порядок блоків записано в локальну чернетку.','ok')}else notice('Натисніть «Зберегти», щоб записати зміни на сервер.');
 });
 $('#featured-add-button').onclick=()=>{collect();const id=$('#featured-add').value;if(!item(id)||state.featured.skus.includes(id)||state.featured.skus.length>=12)return;state.featured.skus.push(id);renderFeatured();if(!backend)persist()};
 $('#category-covers').addEventListener('change',e=>{
   const select=e.target.closest('[data-cover]');if(!select)return;collect();
   const c=select.dataset.cover,p=item(select.value);if(!p||p.category!==c)return;
   state.categories.covers[c]=select.value;renderCovers();if(!backend)persist();
 });
 $('#hero-product').onchange=e=>{const p=item(e.target.value);if(p)$('#hero-photo').src=photo(p)};
 $('#save').onclick=save;$('#save-bottom').onclick=save;
 $('#reset').onclick=()=>{if(!window.confirm('Повернути базові налаштування головної? Інші чернетки товарів залишаться.'))return;state=clone(base);render();if(!backend){persist();notice('Базові налаштування повернено у чернетці.','ok')}else notice('Базові налаштування підготовлені. Натисніть «Зберегти».')};
 $('#export').onclick=()=>{collect();try{validate();persist();const d=draft();const blob=new Blob([JSON.stringify({kind:'3dividruk-catalog-draft',createdAt:new Date().toISOString(),...d},null,2)],{type:'application/json'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='3dividruk-editor-draft.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1200);notice('Файл чернетки підготовлений. Це не публікація на сайті.','ok')}catch(e){notice('Експорт не виконано: '+e.message,'warning')}};
 $('#menu').onclick=()=>document.body.classList.toggle('dividruk-menu-open');
 $('#overlay').onclick=()=>document.body.classList.remove('dividruk-menu-open');
 $('#auth').onsubmit=async e=>{e.preventDefault();token=e.currentTarget.elements.token.value;try{await api('/api/v1/admin/settings');e.currentTarget.elements.token.value='';$('#auth').hidden=true;notice('Вхід виконано.','ok')}catch(err){token='';notice('Помилка входу: '+err.message,'warning')}};
 async function init(){
   try{
     const [c,h]=await Promise.all([api(backend?'/api/v1/catalog':'../data/catalog.json'),api(backend?'/api/v1/homepage':'../data/homepage.json')]);
     catalog=Array.isArray(c)?c:c.products;taxonomy=c.taxonomy||[];base=clone(h);
     const existing=draft();state=clone(!backend&&existing?.homepage?existing.homepage:base);
     state.sections=Array.isArray(state.sections)?state.sections:Object.keys(labels);
     $('#auth').hidden=!backend;render();
     notice(backend?'Налаштування завантажено. Увійдіть, щоб зберігати на сервері.':'Режим локальної чернетки. Зміни покупцям не показуються, поки не перенесені в магазин.','warning');
   }catch(e){notice('Не вдалося завантажити головну: '+e.message,'warning')}
 }
 init();
})();