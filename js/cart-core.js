/* Adapted from ladima75-source/bb610-market js/app.js, commit
 * 2768e6fe30f95e272453384cec86eb2a09970612: money/get/set, SKU cart and addCart.
 * Independent namespace; no legacy migration, analytics or production endpoints.
 */
const DiViCart = (() => {
  const key='3dividruk_cart_v1';
  const money=n=>n!==null&&n!==undefined&&Number.isFinite(Number(n))?new Intl.NumberFormat('uk-UA').format(Number(n))+' ₴':'Ціну уточнюємо';
  const get=(k,fallback)=>{try{return JSON.parse(localStorage.getItem(k))??fallback}catch{return fallback}};
  const set=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{throw new Error('Дозвольте збереження даних у браузері для кошика.')}};
  let products=[];
  const identity=s=>String(s?.commerceSku||s?.sku||'');
  const canBuySku=s=>!!s&&identity(s)&&s.price!==null&&s.price!==undefined&&Number.isFinite(Number(s.price))&&Number(s.price)>0&&['in_stock','preorder'].includes(s.availability);
  const rows=()=>{
    const raw=get(key,[]); if(!Array.isArray(raw))return [];
    return raw.filter(x=>x&&typeof x.sku==='string'&&Number.isInteger(x.qty)&&x.qty>=1&&x.qty<=99);
  };
  const updateBadges=()=>document.querySelectorAll('[data-cart-count]').forEach(e=>e.textContent=rows().reduce((s,x)=>s+x.qty,0));
  function addCart(id,qty=1){
    const s=products.find(p=>identity(p)===id); if(!canBuySku(s))return false;
    qty=Number(qty);if(!Number.isInteger(qty)||qty<1||qty>99)return false;
    const commerceSku=identity(s),cart=rows(),row=cart.find(x=>x.sku===commerceSku);
    if(row)row.qty=Math.min(99,row.qty+qty);else cart.push({sku:commerceSku,qty});
    set(key,cart);updateBadges();return true;
  }
  function change(id,delta){const cart=rows(),row=cart.find(x=>x.sku===id);if(row)row.qty=Math.min(99,Math.max(1,row.qty+delta));set(key,cart);updateBadges()}
  function remove(id){set(key,rows().filter(x=>x.sku!==id));updateBadges()}
  function clear(){set(key,[]);updateBadges()}
  return {key,money,rows,addCart,change,remove,clear,canBuySku,updateBadges,bindCatalog:p=>{products=p;updateBadges()}};
})();
