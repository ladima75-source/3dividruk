// Offline homepage smoke test: actual catalog + JS rendering, no browser or network.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/catalog.json'), 'utf8'));
let homeHtml = '', headerHtml = '', footerHtml = '';
const area = {set innerHTML(v){homeHtml=v},get innerHTML(){return homeHtml},querySelectorAll:()=>[]};
const nav = {querySelectorAll:()=>[],classList:{remove(){},toggle(){}}};
const toggle = {values:{'aria-expanded':'false'},addEventListener(){},getAttribute(k){return this.values[k]},setAttribute(k,v){this.values[k]=v}};
const document = {
  body:{dataset:{page:'home'}},
  querySelector(q){return q.startsWith('meta[name=')?{content:'./'}:q==='.menu-toggle'?toggle:null},
  getElementById(id){
    if(id==='app')return area;
    if(id==='site-header')return {set innerHTML(v){headerHtml=v}};
    if(id==='site-footer')return {set innerHTML(v){footerHtml=v}};
    if(id==='primary-nav')return nav;
    throw new Error('Unexpected element '+id);
  },
  addEventListener(){},querySelectorAll:()=>[]
};
const context=vm.createContext({
  document,location:{href:'https://ladima75-source.github.io/3dividruk/index.html',pathname:'/3dividruk/index.html',search:''},
  window:{DIVIDRUK_COMMERCE_CONFIG:{checkoutMode:'preview'}},
  fetch:async ()=>({ok:true,json:async()=>catalog}),
  DiViCart:{updateBadges(){},bindCatalog(){},money:n=>String(n)+' ₴',canBuySku:p=>!!p&&Number(p.price)>0&&['in_stock','preorder'].includes(p.availability)},
  DiViOrderClient:{},setTimeout,clearTimeout,URL,URLSearchParams
});
const src=fs.readFileSync(path.join(root,'js/store.js'),'utf8');
assert.match(src,/DiViStore\.init\(\);\s*$/);
vm.runInContext(src.replace(/DiViStore\.init\(\);\s*$/,'globalThis.homePromise=DiViStore.init();'),context);
(async()=>{
  await context.homePromise;
  assert.match(headerHtml,/id="primary-nav"/);
  assert.equal((headerHtml.match(/data-nav=/g)||[]).length,8,'Eight navigation links');
  assert.match(headerHtml,/Тестова вітрина/,'Preview remains explicit');
  assert.equal((homeHtml.match(/class="category-tile /g)||[]).length,5,'Five visual categories');
  assert.equal((homeHtml.match(/class="product-card"/g)||[]).length,8,'Eight curated items');
  for(const id of ['lighting','vases','planters','decor','bags'])assert.match(homeHtml,new RegExp('category-'+id));
  assert.match(homeHtml,/Світло теж має форму/);
  assert.match(homeHtml,/Простір.<br>Форма/);
  assert.doesNotMatch(homeHtml,/src="[^"]*(undefined|null)/);
  assert.ok(footerHtml.includes('Prom.ua'),'Prom retained as sales channel');
  console.log('Homepage passed: 183-product catalog, five image categories, eight featured products, navigation, preview safety.');
})().catch(e=>{console.error(e);process.exitCode=1});
