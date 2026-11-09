(()=>{'use strict';
 const $=s=>document.querySelector(s);
 const c=window.DIVIDRUK_COMMERCE_CONFIG||{},backend=c.checkoutMode==='backend';
 document.getElementById('menu').onclick=()=>document.body.classList.toggle('dividruk-menu-open');
 document.getElementById('overlay').onclick=()=>document.body.classList.remove('dividruk-menu-open');
 const esc=v=>String(v??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
 async function load(){
  try{
   const r=await fetch(backend?'/api/v1/catalog':'../data/catalog.json');
   if(!r.ok)throw Error('HTTP '+r.status);
   const d=await r.json(),items=d.products||d,active=items.filter(p=>p.storefront_visible!==false);
   const cats=(d.taxonomy||[]).filter(p=>!p.paused&&items.some(t=>t.category===p.id));
   const subs=cats.reduce((n,p)=>n+(p.subcategories||[]).length,0);
   $('#k-total').textContent=items.length;
   $('#k-live').textContent=active.length;
   $('#k-paused').textContent=items.length-active.length;
   $('#k-groups').textContent=cats.length+' / '+subs;
   const paused=items.filter(p=>p.storefront_visible===false);
   const drafts=(()=>{try{const obj=JSON.parse(localStorage.getItem('3dividruk_admin_draft_v1')||'{}');return (Object.keys(obj.products||{}).length+Object.keys(obj.orders||{}).length+(obj.homepage?1:0)+Object.keys(obj.storefrontHomepages||{}).length)}catch{return 0}})();
   const alerts=[
    {head:'Магазин ще не приймає реальних замовлень',body:'GitHub Pages є тестовою вітриною, а окремий backend поки не розміщено.',warn:true},
    ...(paused.length?[{head:'На паузі: '+paused.length+' товарів',body:'Позиції MaGelle збережені у каталозі, але приховані з продажу.'}]:[]),
    ...(drafts&&!backend?[{head:'Є локальна чернетка редактора',body:drafts+' наборів змін. Експортуйте її з візуального редактора, щоб не втратити.'}]:[]),
    {head:'Картки готові до редакторської перевірки',body:'Перевірте порядок, тексти й фотографії до запуску реклами.'}
   ];
   $('#alerts').innerHTML=alerts.map(x=>'<div class="dashboard-alert '+(x.warn?'warning':'')+'"><strong>'+esc(x.head)+'</strong><span>'+esc(x.body)+'</span></div>').join('');
   $('#categories').innerHTML=cats.map(x=>'<div><span>'+esc(x.label)+'</span><b>'+active.filter(p=>p.category===x.id).length+' <small>тов.</small></b></div>').join('');
   $('#status').textContent=backend?'Окремий сервер підключено. Стан замовлень перевіряйте у захищеному розділі.':'Тестова адмінка: дані каталогу доступні, зміни в браузерній чернетці не публікуються.';
  }catch(e){$('#status').textContent='Не вдалося отримати каталог: '+e.message}
 }
 load();
})();