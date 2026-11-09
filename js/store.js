'use strict';
const DiViStore = (() => {
  const root=document.getElementById('app'),base=new URL(document.querySelector('meta[name="store-base"]').content,location.href);
  const query=new URLSearchParams(location.search);
  const knownStorefronts={svitlo:{label:'Світло',categories:['lighting']},vase:{label:'Вази та кашпо',categories:['vases','planters']},decor:{label:'Декор',categories:['decor']}};
  const proposedStorefront=document.body.dataset.storefront||query.get('storefront')||'';
  const storefrontId=Object.hasOwn(knownStorefronts,proposedStorefront)?proposedStorefront:'';
  const storefrontScope=storefrontId?knownStorefronts[storefrontId]:null;
  const editorPreview=query.get('editorPreview')==='1'&&(window.DIVIDRUK_COMMERCE_CONFIG?.checkoutMode!=='backend');
  const url=path=>{
    const rootPath=storefrontId&&/^(index\.html|catalog\.html)(\?|$)/.test(path)?storefrontId+'/'+path:path;
    const u=new URL(rootPath,base);
    if(storefrontId&&/^(products\/|cart\.html|checkout\.html|order\.html)/.test(path))u.searchParams.set('storefront',storefrontId);
    if(editorPreview&&/^(index\.html|catalog\.html|products\/)/.test(path))u.searchParams.set('editorPreview','1');
    return u.href;
  };
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const cfg=()=>window.DIVIDRUK_COMMERCE_CONFIG||{};
  const backend=()=>cfg().checkoutMode==='backend';
  let products=[],categories=[],limit=24,homepageConfig=null;
  const image=p=>p.images?.[0]||p.image||'';
  const productUrl=p=>url('products/'+p.id+'/');
  function merchandisingOrder(items,draftOrders={}){
    const groups=new Map(),counts=new Map();
    items.forEach((p,i)=>{const k=p.category+'::'+(p.subcategory||'-');if(!groups.has(k))groups.set(k,[]);groups.get(k).push({...p,_sourceIndex:i})});
    for(const [group,list] of groups){
      const explicit=draftOrders[group],positions=new Map((explicit||[]).map((id,i)=>[id,i]));
      list.sort((a,b)=>{
        const aId=a.commerceSku||a.sku,bId=b.commerceSku||b.sku;
        const av=positions.has(aId)?positions.get(aId):a.sort_order??(10000+a._sourceIndex);
        const bv=positions.has(bId)?positions.get(bId):b.sort_order??(10000+b._sourceIndex);
        return av-bv||a._sourceIndex-b._sourceIndex;
      });
    }
    return items.map(p=>{const group=p.category+'::'+(p.subcategory||'-');const i=counts.get(group)||0;counts.set(group,i+1);const ordered=groups.get(group)[i];delete ordered._sourceIndex;return ordered});
  }
  const stock=p=>p.availability==='in_stock'?'В наявності':p.availability==='preorder'?'Під замовлення':p.availability==='out_of_stock'?'Немає в наявності':'Наявність уточнюємо';
  function toast(message){let t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';t.setAttribute('role','status');document.body.append(t)}t.innerHTML=esc(message)+' <a href="'+url('cart.html')+'">До кошика ↗</a>';clearTimeout(t.timer);t.timer=setTimeout(()=>t.remove(),4500)}
  function storefrontNavigation(){
    if(!storefrontScope)return '<a data-nav="home" href="'+url('index.html')+'">Головна</a><a data-nav="catalog" href="'+url('catalog.html')+'">Каталог</a><a data-nav="lighting" href="'+url('catalog.html?category=lighting')+'">Лампи</a><a data-nav="vases" href="'+url('catalog.html?category=vases')+'">Вази</a><a data-nav="planters" href="'+url('catalog.html?category=planters')+'">Кашпо</a><a data-nav="decor" href="'+url('catalog.html?category=decor')+'">Декор</a><a data-nav="about" href="'+url('about.html')+'">Про нас</a>';
    const links=storefrontScope.categories.map(cat=>'<a data-nav="'+cat+'" href="'+url('catalog.html?category='+cat)+'">'+esc(({lighting:'Лампи',vases:'Вази',planters:'Кашпо',decor:'Декор'})[cat])+'</a>').join('');
    const siblings=Object.entries(knownStorefronts).filter(([id])=>id!==storefrontId).map(([id,item])=>'<a href="'+new URL(id+'/index.html',base).href+'">'+esc(item.label)+'</a>').join('');
    return '<a data-nav="home" href="'+url('index.html')+'">Головна</a><a data-nav="catalog" href="'+url('catalog.html')+'">Усі вироби</a>'+links+siblings+'<a data-nav="about" href="'+url('about.html')+'">Про нас</a>';
  }
  function mountShell(){
    if(editorPreview){document.body.classList.add('editor-preview-mode')}
    document.getElementById('site-header').innerHTML=`<a class="skip" href="#main">До вмісту</a><div class="announcement">СТВОРЕНО В УКРАЇНІ · НАДРУКОВАНО З ХАРАКТЕРОМ</div><header class="top"><div class="wrap"><a class="logo" href="${url('index.html')}" aria-label="3DiViDruk — головна">3DiVi<i>Druk</i><small>${storefrontScope?esc(storefrontScope.label.toUpperCase()):'DESIGN IN A NEW DIMENSION'}</small></a><button class="menu-toggle" type="button" aria-controls="primary-nav" aria-expanded="false" aria-label="Відкрити меню"><span aria-hidden="true">☰</span> Меню</button><nav id="primary-nav" class="nav" aria-label="Основна навігація">${storefrontNavigation()}</nav><div class="top-actions"><a class="phone" href="tel:+380972920104">+38 097 292 01 04</a><a class="cart-link" href="${url('cart.html')}">Кошик <span class="count" data-cart-count>0</span></a></div></div></header>${backend()?'<div class="preview">Окремий тестовий магазин · замовлення позначаються як тестові · онлайн-оплата вимкнена</div>':'<div class="preview">Тестова вітрина · перевірте кошик та оформлення. Купівля доступна в <a href="https://3dividruk.com.ua/ua/" style="text-decoration:underline">магазині на Prom.ua ↗</a></div>'}`;
    document.getElementById('site-footer').innerHTML=`<footer><div class="wrap"><div class="footer-grid"><div class="footer-brand"><a class="logo" href="${url('index.html')}">3DiVi<i>Druk</i></a><p style="margin-top:15px;max-width:350px">Предмети з характером для вашого простору.<br>Власне виробництво за допомогою 3D-друку.</p></div><nav aria-label="Інформація"><a href="${url('delivery.html')}">Доставка та оплата</a><a href="${url('returns.html')}">Повернення та обмін</a><a href="${url('privacy.html')}">Конфіденційність</a><a href="${url('contacts.html')}">Контакти</a></nav><nav aria-label="Контакти"><a href="tel:+380972920104">+38 097 292 01 04</a><p>Дніпро, М. Рильського, 106</p><p>Пн–Пт · 10:00–18:00</p><a href="https://3dividruk.com.ua/ua/" target="_blank" rel="noopener">Ми на Prom.ua ↗</a></nav></div><div class="footnote"><span>© ${new Date().getFullYear()} 3DiViDruk. Україна.</span><span>Тестовий сайт · каталог станом на 08.11.2026 · UAH</span></div></div></footer>`;
    if(editorPreview){const note=document.createElement('div');note.className='editor-preview-bar';note.textContent='ПОПЕРЕДНІЙ ПЕРЕГЛЯД ЛОКАЛЬНОЇ ЧЕРНЕТКИ — покупці не бачать цих змін';document.getElementById('site-header').append(note)}
    DiViCart.updateBadges();
    const menu=document.querySelector('.menu-toggle'),nav=document.getElementById('primary-nav');
    function closeMenu(){menu.setAttribute('aria-expanded','false');nav.classList.remove('nav-open');menu.setAttribute('aria-label','Відкрити меню')}
    menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Закрити меню':'Відкрити меню');nav.classList.toggle('nav-open',open)});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});
    document.addEventListener('click',e=>{if(!e.target.closest('.top')&&menu.getAttribute('aria-expanded')==='true')closeMenu()});
    const current=document.body.dataset.page,cat=new URLSearchParams(location.search).get('category');
    nav.querySelectorAll('[data-nav]').forEach(a=>{const key=a.dataset.nav;if((key==='home'&&current==='home')||(key==='about'&&location.pathname.endsWith('/about.html'))||(key==='catalog'&&current==='catalog'&&!cat)||(current==='catalog'&&key===cat))a.setAttribute('aria-current','page')});
  }
  function card(p){return `<article class="product-card"><a class="photo" href="${productUrl(p)}"><img src="${esc(url(image(p)))}" alt="${esc(p.title)}" loading="lazy" width="500" height="500">${p.availability==='out_of_stock'?'<span class="tag">ОЧІКУЄМО</span>':''}</a><div class="card-meta"><span>${esc(p.subcategoryLabel||p.categoryLabel)}</span><span>${esc(p.sku||'Без SKU')}</span></div><h3 class="card-title"><a href="${productUrl(p)}">${esc(p.title)}</a></h3><div class="card-bottom"><span class="price">${DiViCart.money(p.price)}</span><button class="add" data-add="${esc(p.commerceSku)}" ${DiViCart.canBuySku(p)?'':'disabled'} aria-label="Додати ${esc(p.title)} до кошика">+</button></div></article>`}
  function wireAdd(parent=root){parent.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{try{if(DiViCart.addCart(b.dataset.add))toast('Додано до кошика')}catch(e){toast(e.message)}})}
  function categoryTiles(){
    const chosen=homepageConfig?.categories?.covers||{lighting:'SKU0001',vases:'SKU0030',planters:'SKU0216',decor:'SKU0041'};
    const subtitles={lighting:'Світло й атмосфера',vases:'Декор із формою',planters:'Для ваших рослин',decor:'Акценти для простору'};
    return categories.map(c=>{
      const p=products.find(x=>x.category===c.id&&(x.sku===chosen[c.id]||x.commerceSku===chosen[c.id]))||products.find(x=>x.category===c.id);
      if(!p)return '';
      const count=products.filter(x=>x.category===c.id).length;
      return `<a class="category-tile category-${c.id}" href="${url('catalog.html?category='+c.id)}" aria-label="${esc(c.label)} — ${count} товарів"><img src="${esc(url(image(p)))}" alt="" loading="lazy" width="460" height="560"><span class="category-tile-content"><span class="category-overline">${esc(subtitles[c.id])}</span><strong>${esc(c.label)}</strong><span class="category-quantity">${count} виробів</span></span><span class="category-arrow" aria-hidden="true">↗</span></a>`;
    }).join('');
  }
  function categoryShortcuts(){
    return categories.filter(c=>c.subcategories?.length).map(c=>{
      const links=c.subcategories.map(sub=>{
        const count=products.filter(p=>p.category===c.id&&p.subcategory===sub.id).length;
        return '<a href="'+url('catalog.html?category='+c.id+'&subcategory='+sub.id)+'">'+esc(sub.label)+' <span>'+count+'</span></a>';
      }).join('');
      return '<div class="home-shortcut-group"><strong>'+esc(c.label)+'</strong><div class="home-shortcut-links">'+links+'</div></div>';
    }).join('');
  }
  function home(){
    const h=homepageConfig||{},heroCfg=h.hero||{},catCfg=h.categories||{},featCfg=h.featured||{},spotCfg=h.feature||{},storyCfg=h.story||{};
    const val=(v,fallback)=>esc(typeof v==='string'?v:fallback);
    const select=sku=>products.find(p=>(p.sku===sku||p.commerceSku===sku)&&DiViCart.canBuySku(p));
    const hero=select(heroCfg.sku||'SKU0001')||products.find(p=>p.category==='lighting'&&DiViCart.canBuySku(p))||products[0];
    const heroName=hero.sku==='SKU0001'?'Лампа «Безодня»':hero.title.split('.')[0];
    const featured=[];
    for(const sku of (Array.isArray(featCfg.skus)?featCfg.skus:['SKU0001','SKU0030','SKU0216','SKU0041','SKU0017','SKU0028','SKU0280'])){
      const p=select(sku);if(p&&!featured.includes(p))featured.push(p);
    }
    if(!homepageConfig||!Array.isArray(featCfg.skus)){
      for(const c of ['lighting','vases','planters','decor']){
        if(!featured.some(p=>p.category===c)){const p=products.find(x=>x.category===c&&DiViCart.canBuySku(x));if(p)featured.push(p)}
      }
    }
    const spotlight=select(spotCfg.sku||'SKU0017')||products.find(p=>p.category==='lighting'&&p.id!==hero.id)||hero;
    root.innerHTML=`<div class="wrap homepage">
      <section class="hero home-hero" aria-labelledby="home-title">
        <div class="hero-copy">
          <span class="eyebrow">${val(heroCfg.eyebrow,'3DiViDruk / дизайн через 3D-друк')}</span>
          <h1 id="home-title">${(Array.isArray(heroCfg.titleLines)&&heroCfg.titleLines.length===3?heroCfg.titleLines:['Простір.','Форма.','Характер.']).map((line,i)=>i===2?'<span>'+esc(line)+'</span>':esc(line)).join('<br>')}</h1>
          <p>${val(heroCfg.description,'Дизайнерські світильники, вази, кашпо й предмети декору, створені за допомогою 3D-друку у власній майстерні в Україні.')}</p>
          <div class="home-hero-actions"><a class="btn" href="${url('catalog.html')}">Переглянути вироби <span aria-hidden="true">↗</span></a><a class="home-inline-link" href="${url('about.html')}">Про майстерню</a></div>
          <div class="home-hero-facts"><span>Власна майстерня у Дніпрі</span><span>${categories.length} колекцій</span></div>
        </div>
        <a class="hero-image" href="${productUrl(hero)}" aria-label="Переглянути виріб: ${esc(hero.title)}"><img src="${esc(url(image(hero)))}" alt="${esc(hero.title)}" fetchpriority="high" width="760" height="780"><span class="hero-caption"><span>У фокусі · ${esc(heroName)}</span><span>Детальніше ↗</span></span></a>
      </section>
      <section class="home-categories" aria-labelledby="home-categories-title">
        <div class="section-head"><div><span class="eyebrow">${val(catCfg.eyebrow,'Каталог 3DiViDruk')}</span><h2 id="home-categories-title">${val(catCfg.title,'Знайдіть свій стиль')}</h2></div><a class="text-link" href="${url('catalog.html')}">Усі категорії ↗</a></div>
        <div class="category-tiles">${categoryTiles()}</div><div class="home-category-shortcuts" aria-label="Підрозділи каталогу">${categoryShortcuts()}</div>
      </section>
      <section class="home-picks" aria-labelledby="home-picks-title">
        <div class="section-head"><div><span class="eyebrow">${val(featCfg.eyebrow,'Вибір із колекцій')}</span><h2 id="home-picks-title">${val(featCfg.title,'Речі, які привертають увагу')}</h2><p class="section-intro">${val(featCfg.description,'Від скульптурного світла до невеликих деталей для дому.')}</p></div><a class="text-link" href="${url('catalog.html')}">Переглянути всі ${products.length} ↗</a></div>
        <div class="grid">${featured.map(card).join('')}</div>
      </section>
      <section class="home-feature" aria-labelledby="home-feature-title">
        <a class="home-feature-image" href="${productUrl(spotlight)}"><img src="${esc(url(image(spotlight)))}" loading="lazy" alt="${esc(spotlight.title)}" width="680" height="590"></a>
        <div class="home-feature-copy"><span class="eyebrow">${val(spotCfg.eyebrow,'Освітлення / 3D-дизайн')}</span><h2 id="home-feature-title">${val(spotCfg.title,'Світло теж має форму.')}</h2><p>${val(spotCfg.description,'Фактура, силует і гра світла змінюють відчуття простору. Знайдіть світильник, який пасуватиме саме вам.')}</p><a class="btn light" href="${url('catalog.html?category=lighting')}">Обрати світильник ↗</a></div>
      </section>
      <section class="story"><div><span class="eyebrow">${val(storyCfg.eyebrow,'Майстерня у Дніпрі')}</span><h2>${val(storyCfg.title,'Ідеї набувають форми. Шар за шаром.')}</h2></div><div><p>${val(storyCfg.description,'Ми створюємо предмети для дому й аксесуари методом 3D-друку. Нам подобаються виразні поверхні, незвичні силуети та речі з характером.')}</p><a class="text-link" style="display:inline-block;margin-top:25px" href="${url('about.html')}">Знайомство з 3DiViDruk ↗</a></div></section>
      <div class="benefits"><div><strong>Власне виробництво</strong><p>Майстерня 3D-друку в Дніпрі.</p></div><div><strong>Вибір для інтер'єру</strong><p>Освітлення, вази, кашпо, декор і аксесуари.</p></div><div><strong>Питання щодо виробу?</strong><p><a href="tel:+380972920104">Зателефонувати нам ↗</a></p></div></div>
    </div>`;
    const names=['categories','featured','feature','story','benefits'];
    const sectionNodes=Object.fromEntries(names.map(id=>[id,root.querySelector(({categories:'.home-categories',featured:'.home-picks',feature:'.home-feature',story:'.story',benefits:'.benefits'})[id])]));
    const requested=Array.isArray(h.sections)?h.sections:names;
    const priority=[...new Set([...requested.filter(id=>names.includes(id)),...names])];
    const wrapper=root.querySelector('.homepage');
    priority.forEach(id=>{if(sectionNodes[id])wrapper.appendChild(sectionNodes[id])});
    wireAdd();
  }
  function catalog(){
    const params=new URLSearchParams(location.search),query=params.get('q')||'',cat=params.get('category')||'',sub=params.get('subcategory')||'';
    root.innerHTML=`<div class="wrap"><div class="breadcrumb"><a href="${url('index.html')}">Головна</a> / Каталог</div><h1 class="page-title" id="catalog-title">Знайдіть свою форму.</h1><p style="color:var(--muted);margin-bottom:28px">Дизайнерські вироби, освітлення та аксесуари з 3D-друку.</p><form id="filters" class="catalog-tools"><input class="field" name="q" type="search" placeholder="Назва або артикул" aria-label="Пошук у каталозі" value="${esc(query)}"><select class="field" name="category" aria-label="Категорія"><option value="">Усі колекції</option>${categories.map(c=>`<option value="${c.id}" ${cat===c.id?'selected':''}>${esc(c.label)}</option>`).join('')}</select><select class="field" name="subcategory" aria-label="Підкатегорія" hidden disabled><option value="">Усі підкатегорії</option></select><select class="field" name="sort" aria-label="Сортування"><option value="default">Рекомендовані</option><option value="price-asc">Від дешевших</option><option value="price-desc">Від дорожчих</option><option value="name">За назвою</option></select></form><div id="subcategory-shortcuts" class="catalog-subcategory-shortcuts" aria-label="Перегляд підкатегорій"></div><p id="result-count" class="result-count" aria-live="polite"></p><div class="grid" id="catalog-grid"></div><button class="btn light load-more" id="load-more">Показати ще</button></div>`;
    const form=document.getElementById('filters'),subSelect=form.elements.subcategory;
    function syncSubcategory(selected=''){
      const cat=categories.find(c=>c.id===form.elements.category.value);
      const subs=cat?.subcategories||[];
      subSelect.innerHTML='<option value="">Усі підкатегорії</option>'+subs.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.label)+'</option>').join('');
      subSelect.hidden=!subs.length;subSelect.disabled=!subs.length;
      if(subs.some(x=>x.id===selected))subSelect.value=selected;
    }
    function shortcuts(cat){
      const target=document.getElementById('subcategory-shortcuts');
      const sections=cat?categories.filter(c=>c.id===cat&&c.subcategories?.length):categories.filter(c=>c.subcategories?.length);
      target.innerHTML=sections.map(c=>'<div class="catalog-shortcut-group"><b>'+esc(c.label)+'</b>'+c.subcategories.map(sub=>{
        const count=products.filter(p=>p.category===c.id&&p.subcategory===sub.id).length;
        const active=form.elements.subcategory.value===sub.id&&form.elements.category.value===c.id;
        return '<a '+(active?'aria-current="page" ':'')+'href="'+url('catalog.html?category='+c.id+'&subcategory='+sub.id)+'">'+esc(sub.label)+' <small>'+count+'</small></a>';
      }).join('')+'</div>').join('');
    }
    function render(){
      const data=new FormData(form),q=String(data.get('q')||'').toLocaleLowerCase('uk').trim();
      const c=String(data.get('category')||''),sub=String(data.get('subcategory')||''),sort=String(data.get('sort')||'default');
      let selected=products.filter(p=>(!c||p.category===c)&&(!sub||p.subcategory===sub)&&(!q||(p.title+' '+p.sku).toLocaleLowerCase('uk').includes(q)));
      if(sort==='price-asc')selected.sort((a,b)=>(a.price??Infinity)-(b.price??Infinity));
      if(sort==='price-desc')selected.sort((a,b)=>(b.price??-1)-(a.price??-1));
      if(sort==='name')selected.sort((a,b)=>a.title.localeCompare(b.title,'uk'));
      const group=categories.find(x=>x.id===c),child=group?.subcategories?.find(x=>x.id===sub);
      document.getElementById('catalog-title').textContent=child?.label||group?.label||'Знайдіть свою форму.';
      document.getElementById('result-count').textContent='Знайдено '+selected.length+' · показано '+Math.min(limit,selected.length);
      document.getElementById('catalog-grid').innerHTML=selected.length?selected.slice(0,limit).map(card).join(''):'<p class="empty" style="grid-column:1/-1">Нічого не знайдено. Спробуйте іншу назву або артикул.</p>';
      document.getElementById('load-more').hidden=limit>=selected.length;
      shortcuts(c);wireAdd();
      const next=new URLSearchParams();if(q)next.set('q',q);if(c)next.set('category',c);if(sub)next.set('subcategory',sub);if(editorPreview)next.set('editorPreview','1');
      history.replaceState(null,'',location.pathname+(next.size?'?'+next:''));
    }
    syncSubcategory(sub);
    form.onsubmit=e=>{e.preventDefault();limit=24;render()};
    form.oninput=e=>{if(e.target===form.elements.q){limit=24;render()}};
    form.onchange=e=>{if(e.target===form.elements.category)syncSubcategory();limit=24;render()};
    document.getElementById('load-more').onclick=()=>{limit+=24;render()};
    render();
  }
  function product(){
    const id=document.body.dataset.productId||new URLSearchParams(location.search).get('id'),p=products.find(p=>p.id===id||p.commerceSku===id);
    if(!p){const paused=document.body.dataset.paused==="true";root.innerHTML=`<div class="wrap empty"><h1>${paused?"Виріб тимчасово не представлений":"Виріб не знайдено"}</h1>${paused?"<p>Цю позицію поставлено на паузу. Усі дані про неї збережені.</p>":""}<a class="btn" href="${url('catalog.html')}">До каталогу ↗</a></div>`;return}
    document.title=p.title+' · 3DiViDruk';
    root.innerHTML=`<div class="wrap"><div class="breadcrumb"><a href="${url('index.html')}">Головна</a> / <a href="${url('catalog.html?category='+p.category)}">${esc(p.categoryLabel)}</a>${p.subcategory?` / <a href="${url('catalog.html?category='+p.category+'&subcategory='+p.subcategory)}">${esc(p.subcategoryLabel)}</a>`:''} / ${esc(p.sku)}</div><article><div class="product-layout"><div><img id="main-photo" class="main-photo" src="${esc(url(image(p)))}" alt="${esc(p.title)}" width="800" height="800" tabindex="0" role="button" aria-label="Збільшити фото: ${esc(p.title)}"><div class="thumbs" aria-label="Фотографії виробу">${p.images.map((src,i)=>`<button class="thumb" data-image="${esc(url(src))}" aria-label="Фото ${i+1}"><img src="${esc(url(src))}" alt="${esc(p.title)} — фото ${i+1}" loading="lazy" width="75" height="75"></button>`).join('')}</div><p class="gallery-count">${p.images.length} фото · з публічної картки виробу</p></div><div class="product-info"><span class="eyebrow">${esc(p.subcategoryLabel||p.categoryLabel)} / 3DiViDruk</span><h1>${esc(p.title)}</h1><span class="price">${DiViCart.money(p.price)}</span><p class="stock">● ${stock(p)} · ${esc(p.sku||'Артикул не вказано')}</p><div class="buy-row"><input id="product-qty" class="field" type="number" min="1" max="99" step="1" value="1" aria-label="Кількість"><button class="btn accent" id="buy-product" ${DiViCart.canBuySku(p)?'':'disabled'}>Додати до кошика <span>+</span></button></div><div class="product-notes"><p>Доставка Україною · вартість за тарифами перевізника</p><p>Наявність та строки виготовлення підтверджуємо окремо.</p><p>Потрібна порада? <a href="tel:+380972920104" style="text-decoration:underline">+38 097 292 01 04</a></p></div><p class="muted" style="margin-top:20px">Ціна та наявність перенесені 08.11.2026. <a class="text-link" href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">Картка на Prom.ua ↗</a></p></div></div><section class="description"><h2>Про виріб</h2>${(p.description||'Опис доступний у вихідній картці виробу.').split(/\n+/).filter(Boolean).map(t=>`<p>${esc(t)}</p>`).join('')}${p.attributes?.length?`<h2>Характеристики</h2><table class="attributes">${p.attributes.map(a=>`<tr><td>${esc(a.name)}</td><td>${esc(a.value)}</td></tr>`).join('')}</table>`:''}</section></article></div>`;
    const photos=p.images.length?p.images:[image(p)];
    const thumbs=[...root.querySelectorAll('[data-image]')],mainPhoto=document.getElementById('main-photo');
    const gallery=document.createElement('dialog');
    gallery.className='product-gallery-modal';
    gallery.setAttribute('aria-label','Фотогалерея: '+p.title);
    gallery.innerHTML='<div class="gallery-viewer"><button type="button" class="gallery-close" aria-label="Закрити перегляд">✕</button><button type="button" class="gallery-prev" aria-label="Попереднє фото">‹</button><img class="gallery-full-image" alt=""><button type="button" class="gallery-next" aria-label="Наступне фото">›</button><span class="gallery-counter" aria-live="polite"></span></div>';
    root.append(gallery);
    const fullImage=gallery.querySelector('.gallery-full-image'),counter=gallery.querySelector('.gallery-counter');
    let activePhoto=0;
    function showPhoto(n){
      activePhoto=(n+photos.length)%photos.length;
      const src=url(photos[activePhoto]);
      mainPhoto.src=src;fullImage.src=src;fullImage.alt=p.title+' — фото '+(activePhoto+1);
      counter.textContent=(activePhoto+1)+' / '+photos.length;
      thumbs.forEach((b,i)=>{b.setAttribute('aria-pressed',i===activePhoto?'true':'false');b.classList.toggle('selected',i===activePhoto)});
    }
    thumbs.forEach((b,i)=>b.onclick=()=>showPhoto(i));
    function openGallery(){showPhoto(activePhoto);gallery.showModal()}
    mainPhoto.onclick=openGallery;
    mainPhoto.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openGallery()}};
    gallery.querySelector('.gallery-close').onclick=()=>gallery.close();
    gallery.querySelector('.gallery-prev').onclick=()=>showPhoto(activePhoto-1);
    gallery.querySelector('.gallery-next').onclick=()=>showPhoto(activePhoto+1);
    gallery.onkeydown=e=>{if(e.key==='ArrowLeft'){e.preventDefault();showPhoto(activePhoto-1)}if(e.key==='ArrowRight'){e.preventDefault();showPhoto(activePhoto+1)}};
    gallery.onclick=e=>{if(e.target===gallery)gallery.close()};
    let touchStart=null;
    fullImage.addEventListener('touchstart',e=>{touchStart=e.changedTouches[0]?.clientX??null},{passive:true});
    fullImage.addEventListener('touchend',e=>{if(touchStart===null)return;const delta=(e.changedTouches[0]?.clientX??touchStart)-touchStart;touchStart=null;if(Math.abs(delta)>45)showPhoto(activePhoto+(delta<0?1:-1))},{passive:true});
    showPhoto(0);
    document.getElementById('buy-product').onclick=()=>{const qty=document.getElementById('product-qty');if(qty.reportValidity())try{if(DiViCart.addCart(p.commerceSku,Number(qty.value)))toast('Додано до кошика')}catch(e){toast(e.message)}};
  }
  function cartRows(){return DiViCart.rows().map(row=>({row,p:products.find(p=>p.commerceSku===row.sku)}))}
  function summary(rows,checkout=false){const total=rows.reduce((s,x)=>s+(x.p?.price||0)*x.row.qty,0),valid=rows.length&&rows.every(x=>DiViCart.canBuySku(x.p));return `<aside class="summary"><h2>Ваше замовлення</h2>${checkout?rows.map(x=>`<div class="summary-line"><span>${esc(x.p?.title||x.row.sku)} × ${x.row.qty}</span><b>${DiViCart.money((x.p?.price||0)*x.row.qty)}</b></div>`).join(''):''}<div class="summary-line"><span>Товари</span><b>${DiViCart.money(total)}</b></div><div class="summary-line"><span>Доставка</span><span>За тарифами перевізника</span></div><div class="summary-line total"><span>Разом за товари</span><strong>${DiViCart.money(total)}</strong></div><p class="muted">Доставка та комісія післяплати оплачуються окремо. Остаточну наявність підтверджуємо перед відправленням.</p>${checkout?'':`<a class="btn" href="${url('checkout.html')}" ${valid?'':'aria-disabled="true"'}>Перейти до оформлення ↗</a>`}</aside>`}
  function cart(){const rows=cartRows();root.innerHTML=`<div class="wrap"><div class="breadcrumb"><a href="${url('index.html')}">Головна</a> / Кошик</div><h1 class="page-title">Ваші знахідки.</h1>${rows.length?`<div class="cart-layout"><div>${rows.map(({row,p})=>`<article class="cart-item">${p?`<a href="${productUrl(p)}"><img src="${esc(url(image(p)))}" alt="${esc(p.title)}"></a>`:'<span>!</span>'}<div><h3>${p?`<a href="${productUrl(p)}">${esc(p.title)}</a>`:esc(row.sku)+' — більше немає в каталозі'}</h3><p class="muted">${esc(row.sku)} · ${p?stock(p):'Видаліть з кошика'}</p><div class="quantity"><button data-minus="${esc(row.sku)}" aria-label="Зменшити кількість ${esc(row.sku)}">−</button><span>${row.qty}</span><button data-plus="${esc(row.sku)}" aria-label="Збільшити кількість ${esc(row.sku)}">+</button></div></div><div class="cart-item-price"><b>${DiViCart.money(p?row.qty*p.price:null)}</b><br><button class="remove" data-remove="${esc(row.sku)}">Видалити</button></div></article>`).join('')}</div>${summary(rows)}</div>`:`<div class="empty"><p>Кошик поки порожній. Знайдемо щось особливе?</p><a class="btn" style="margin-top:20px" href="${url('catalog.html')}">Відкрити каталог ↗</a></div>`}</div>`;for(const [attr,action]of [['plus',s=>DiViCart.change(s,1)],['minus',s=>DiViCart.change(s,-1)],['remove',s=>DiViCart.remove(s)]])root.querySelectorAll('[data-'+attr+']').forEach(b=>b.onclick=()=>{action(b.dataset[attr]);DiViOrderClient.resetRequestId();cart()})}
  function checkout(){
    const rows=cartRows();if(!rows.length){cart();return}if(!rows.every(x=>DiViCart.canBuySku(x.p))){root.innerHTML=`<div class="wrap empty"><p>Деякі вироби більше недоступні. Оновіть кошик.</p><a class="btn" href="${url('cart.html')}">До кошика</a></div>`;return}
    const demo=!backend();
    root.innerHTML=`<div class="wrap"><div class="breadcrumb"><a href="${url('cart.html')}">Кошик</a> / Оформлення</div><h1 class="page-title">Майже у вас.</h1><div class="checkout-grid"><div><div class="notice">${demo?'Це перевірка оформлення. Введіть вигадані контактні дані: заявка нікому не надсилається. Для справжньої покупки перейдіть на Prom.ua.':'Це окремий тестовий backend. Використовуйте вигадані контакти. Реальної оплати та відправлення не буде.'}</div><form id="checkout-form"><h2 class="form-section">01 / Контактні дані</h2><div class="form-grid"><label>Ім’я та прізвище<input class="field" name="name" required minlength="2" maxlength="120" autocomplete="off"></label><label>Телефон<input class="field" name="phone" type="tel" required pattern="[+]?380[0-9]{9}" placeholder="+380XXXXXXXXX" autocomplete="off"></label><label class="full">Email (необов’язково)<input class="field" name="email" type="email" maxlength="254" autocomplete="off"></label></div><h2 class="form-section">02 / Доставка</h2><div class="form-grid"><label>Спосіб доставки<select class="field" name="provider"><option value="nova_poshta">Нова пошта — відділення</option><option value="nova_poshta_locker">Нова пошта — поштомат</option><option value="ukrposhta">Укрпошта — відділення</option><option value="pickup">Самовивіз у Дніпрі</option></select></label><label>Місто<input class="field" name="city" required maxlength="120" autocomplete="off"></label><label class="full" id="branch-label">Номер / адреса відділення або поштомата<input class="field" name="branch" required maxlength="250" autocomplete="off"></label></div><h2 class="form-section">03 / Оплата</h2><div class="notice" style="background:var(--sage);color:var(--ink)">При отриманні · онлайн-оплата вимкнена. Жодних платіжних реквізитів вводити не потрібно.</div><div class="form-grid"><label class="full">Коментар<textarea class="field" name="comment" rows="3" maxlength="1000"></textarea></label><label class="checkline full"><input type="checkbox" required name="consent"><span>Я розумію, що це тестове оформлення, і ознайомився/лась з <a href="${url('privacy.html')}" style="text-decoration:underline">інформацією про обробку даних</a>.</span></label></div><button class="btn accent" style="margin-top:25px" type="submit">${demo?'Перевірити оформлення':'Створити тестове замовлення'} ↗</button><div id="checkout-error" class="error" role="alert"></div></form></div>${summary(rows,true)}</div></div>`;
    const form=document.getElementById('checkout-form'),provider=form.elements.provider;
    provider.onchange=()=>{const pickup=provider.value==='pickup';document.getElementById('branch-label').hidden=pickup;form.elements.branch.required=!pickup;if(pickup)form.elements.city.value='Дніпро';DiViOrderClient.resetRequestId()};
    form.addEventListener('input',()=>DiViOrderClient.resetRequestId());
    form.onsubmit=async e=>{e.preventDefault();if(!form.reportValidity())return;const button=form.querySelector('button[type=submit]'),error=document.getElementById('checkout-error');error.textContent='';button.disabled=true;
      try{if(demo){root.innerHTML=`<div class="wrap success"><span class="eyebrow">Перевірка завершена</span><h1>Усе готово до наступного кроку.</h1><p>Форма заповнена коректно. Це демонстрація: замовлення не створювалось, контактні дані не збережено та не надіслано.</p><p>У кошику: ${DiViCart.money(rows.reduce((s,x)=>s+x.p.price*x.row.qty,0))}. Кошик збережено для перевірки.</p><a class="btn" href="https://3dividruk.com.ua/ua/">Зробити справжнє замовлення на Prom.ua ↗</a><a class="text-link" style="margin-left:20px" href="${url('cart.html')}">Повернутися до кошика</a></div>`;return}
      const data=new FormData(form),p=data.get('provider');const result=await DiViOrderClient.createOrder({customer:{name:data.get('name').trim(),phone:data.get('phone').trim(),email:data.get('email').trim()},items:rows.map(x=>({sku:x.row.sku,quantity:x.row.qty})),fulfillment:{provider:p==='nova_poshta_locker'?'nova_poshta':p,service:p==='pickup'?'pickup':p==='nova_poshta_locker'?'locker':'branch',city:data.get('city').trim(),branch:p==='pickup'?'':data.get('branch').trim()},payment:{method:'cod'},comment:data.get('comment'),test_order:true});
      sessionStorage.setItem('3dividruk_last_order',JSON.stringify({order_id:result.order_id,public_token:result.public_token}));DiViCart.clear();DiViOrderClient.resetRequestId();location.href=url('order.html');
      }catch(e){error.textContent=e.message==='BACKEND_NOT_CONFIGURED'?'Сервіс замовлень ще не підключено.':e.message;button.disabled=false}
    };
  }
  async function order(){let last;try{last=JSON.parse(sessionStorage.getItem('3dividruk_last_order'))}catch{}if(!last||!backend()){root.innerHTML=`<div class="wrap empty">Замовлення в цій сесії не знайдено. <a href="${url('catalog.html')}">До каталогу</a></div>`;return}try{const response=await DiViOrderClient.getOrder(last.order_id,last.public_token),o=response.order||response;root.innerHTML=`<div class="wrap success"><span class="eyebrow">Тестове замовлення</span><h1>Дякуємо!</h1><p>Замовлення ${esc(o.order_number||o.order_id)} створене в окремій системі 3DiViDruk.</p><p>Сума за товари: <strong>${DiViCart.money(o.total)}</strong></p><p>Статус: ${esc(o.status)}. Це тест — кошти не списуються, відправлення не створюється.</p><a class="btn" href="${url('catalog.html')}">Повернутися до колекції ↗</a></div>`}catch(e){root.innerHTML='<div class="wrap error">'+esc(e.message)+'</div>'}}
  function normalize(p){const images=(p.images||p.localImages||p.imageUrls||[]).map(i=>typeof i==='string'?i:(i.local||i.url||i.src)).filter(Boolean);const title=p.title||p.name||'';let category=p.category||'';if(!['lighting','vases','planters','decor','bags'].includes(category)){category=/сумк/i.test(title)?'bags':/ламп|світильник/i.test(title)?'lighting':/ваз[аи]/i.test(title)?'vases':/горщик|кашпо/i.test(title)?'planters':'decor'}const sku=p.sku||'',id=String(p.id||p.sourceProductId);return {...p,id,sku,commerceSku:p.commerceSku||sku||('PROM-'+id),title,price:p.price==null?null:Number(p.price),category,categoryLabel:p.categoryLabel||{lighting:'Освітлення',vases:'Вази',planters:'Кашпо',decor:'Декор',bags:'Сумки MaGelle'}[category],subcategory:p.subcategory||null,subcategoryLabel:p.subcategoryLabel||'',images:images.length?images:[p.image||'assets/placeholder.svg'],description:p.description||p.descriptionText||'',attributes:Array.isArray(p.attributes)?p.attributes:[]}}
  async function init(){mountShell();const page=document.body.dataset.page;if(page==='policy')return;try{const endpoint=backend()?(cfg().apiBaseUrl||'')+cfg().endpoints.catalog:url('data/catalog.json');const response=await fetch(endpoint);if(!response.ok)throw new Error('Каталог тимчасово недоступний');const data=await response.json();let draftOrders={};
    let loaded=(Array.isArray(data)?data:data.products).map(normalize).filter(p=>p.storefront_visible!==false&&(!storefrontScope||storefrontScope.categories.includes(p.category)));
    if(editorPreview){
      try{
        const draft=JSON.parse(localStorage.getItem('3dividruk_admin_draft_v1')||'null');
        if(draft?.version===1){
          loaded=loaded.map(p=>({...p,...(draft.products?.[p.commerceSku]||{})}));
          draftOrders=draft.orders||{};
        }
      }catch(e){console.warn('Editor preview unavailable:',e)}
    }
    products=merchandisingOrder(loaded,draftOrders);
    if(page==='home'){
      try{
        if(storefrontId){
          const res=await fetch(url('data/storefront-homepages.json'));
          if(res.ok)homepageConfig=(await res.json()).storefronts?.[storefrontId]||null;
        }else{
          const res=await fetch(backend()?'/api/v1/homepage':url('data/homepage.json'));
          if(res.ok)homepageConfig=await res.json();
        }
        if(editorPreview){
          const draft=JSON.parse(localStorage.getItem('3dividruk_admin_draft_v1')||'null');
          const proposed=storefrontId?draft?.storefrontHomepages?.[storefrontId]:draft?.homepage;
          if(draft?.version===1&&proposed&&typeof proposed==='object')homepageConfig=proposed;
        }
      }catch(e){console.warn('Homepage settings unavailable; using defaults',e)}
    }
    categories=(Array.isArray(data.taxonomy)?data.taxonomy:[{id:'lighting',label:'Освітлення',subcategories:[]},{id:'vases',label:'Вази',subcategories:[]},{id:'planters',label:'Кашпо',subcategories:[]},{id:'decor',label:'Декор',subcategories:[]}]).filter(c=>!c.paused&&products.some(p=>p.category===c.id));DiViCart.bindCatalog(products);if(!products.length)throw new Error('Каталог готується');await ({home,catalog,product,cart,checkout,order}[page]||home)()}catch(e){root.innerHTML=`<div class="wrap empty"><h1>Завантаження не вдалося</h1><p>${esc(e.message)}</p><a class="btn" style="margin-top:20px" href="https://3dividruk.com.ua/ua/">Відкрити магазин на Prom.ua ↗</a></div>`}}
  return {init};
})();
DiViStore.init();
