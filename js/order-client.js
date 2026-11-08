/* Adapted from bb610-market js/order-client.js @ 2768e6fe30f95e272453384cec86eb2a09970612 */
const DiViOrderClient = (() => {
  const cfg = () => window.DIVIDRUK_COMMERCE_CONFIG || {};
  const configured = () => cfg().checkoutMode === 'backend' && typeof cfg().apiBaseUrl === 'string';
  const base = () => (cfg().apiBaseUrl || '').replace(/\/$/, '');
  const endpoint = key => base() + (cfg().endpoints?.[key] || '');
  function requestId(){
    let id=sessionStorage.getItem('3dividruk_checkout_request_id');
    if(!id){id=(crypto.randomUUID?crypto.randomUUID():`3dividruk-${Date.now()}-${Math.random().toString(16).slice(2)}`);sessionStorage.setItem('3dividruk_checkout_request_id',id)}
    return id;
  }
  async function fetchJson(url, options={}){
    const ctrl=new AbortController();
    const timeout=setTimeout(()=>ctrl.abort(),cfg().requestTimeoutMs||12000);
    try{
      const r=await fetch(url,{...options,signal:ctrl.signal,headers:{'Accept':'application/json',...(options.headers||{})}});
      const data=await r.json().catch(()=>({}));
      if(!r.ok){const e=new Error(data.message||`HTTP ${r.status}`);e.status=r.status;e.data=data;throw e}
      return data;
    }finally{clearTimeout(timeout)}
  }
  async function paymentMethods(){
    if(!configured()) return {methods:[]};
    return fetchJson(endpoint('paymentMethods'));
  }
  async function createOrder(payload){
    if(!configured()) throw Object.assign(new Error('BACKEND_NOT_CONFIGURED'),{code:'BACKEND_NOT_CONFIGURED'});
    const id=requestId();
    return fetchJson(endpoint('createOrder'),{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':id},body:JSON.stringify({...payload,client_request_id:id})});
  }
  async function getOrder(orderId, publicToken){
    if(!configured()) throw Object.assign(new Error('BACKEND_NOT_CONFIGURED'),{code:'BACKEND_NOT_CONFIGURED'});
    const path=(cfg().endpoints?.getOrder||'/api/v1/orders/{orderId}').replace('{orderId}',encodeURIComponent(orderId));
    const u=new URL(base()+path, location.origin);
    if(publicToken)u.searchParams.set('token',publicToken);
    return fetchJson(u.toString());
  }
  function resetRequestId(){sessionStorage.removeItem('3dividruk_checkout_request_id')}
  return {configured,paymentMethods,createOrder,getOrder,requestId,resetRequestId};
})();