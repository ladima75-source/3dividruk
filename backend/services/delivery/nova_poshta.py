from __future__ import annotations
import json, time, urllib.request, urllib.error, re
from datetime import datetime
from .base import DeliveryAdapter, DeliveryCapability, DeliveryNotConfigured, DeliveryUpstreamError
import os

def get_value(key, default=''):
    if key == 'nova_poshta.api_key':
        return os.environ.get('DIVIDRUK_NOVA_POSHTA_API_KEY', default)
    if key == 'nova_poshta.api_url':
        return 'https://api.novaposhta.ua/v2.0/json/'
    return default

_CACHE: dict[tuple, tuple[float, list[dict]]] = {}

def _cached(key: tuple, ttl: int, loader):
    now = time.monotonic()
    hit = _CACHE.get(key)
    if hit and hit[0] > now:
        return hit[1]
    value = loader()
    _CACHE[key] = (now + ttl, value)
    return value

def _phone(v) -> str:
    if isinstance(v,(list,tuple)):
        v=v[0] if v else ''
    d = re.sub(r'\D+', '', str(v or ''))
    if d.startswith('0') and len(d) == 10:
        d = '38' + d
    if len(d) == 12 and d.startswith('380'):
        return d
    return d

def _split_name(v: str | None):
    p = [x for x in re.split(r'\s+', (v or '').strip()) if x]
    if not p:
        return ('Покупець', '', '3DiViDruk')
    if len(p) == 1:
        return (p[0], '', p[0])
    if len(p) == 2:
        return (p[1], '', p[0])
    return (p[1], ' '.join(p[2:]), p[0])

class NovaPoshtaAdapter(DeliveryAdapter):
    provider='nova_poshta'; label='Нова пошта'

    @property
    def api_key(self): return get_value('nova_poshta.api_key','')
    @property
    def endpoint(self): return get_value('nova_poshta.api_url','https://api.novaposhta.ua/v2.0/json/') or 'https://api.novaposhta.ua/v2.0/json/'
    @property
    def sender_ref(self): return get_value('nova_poshta.sender_ref','')
    @property
    def sender_contact_ref(self): return get_value('nova_poshta.sender_contact_ref','')
    @property
    def sender_city_ref(self): return get_value('nova_poshta.sender_city_ref','')
    @property
    def sender_address_ref(self): return get_value('nova_poshta.sender_address_ref','')
    @property
    def shipment_weight(self):
        try: return max(0.1, float(get_value('nova_poshta.shipment_weight','1.0') or 1.0))
        except Exception: return 1.0
    @property
    def shipment_description(self): return get_value('nova_poshta.shipment_description','Декор 3DiViDruk') or 'Декор 3DiViDruk'
    @property
    def payer_type(self): return get_value('nova_poshta.payer_type','Recipient') or 'Recipient'
    @property
    def payment_method(self): return get_value('nova_poshta.payment_method','Cash') or 'Cash'

    def capability(self):
        live=bool(self.api_key)
        create=False
        return DeliveryCapability(self.provider,self.label,live,live,create,False,('branch','locker'))

    def _call(self,model,method,props):
        if not self.api_key: raise DeliveryNotConfigured('Nova Poshta API key is not configured')
        body=json.dumps({'apiKey':self.api_key,'modelName':model,'calledMethod':method,'methodProperties':props},ensure_ascii=False).encode('utf-8')
        req=urllib.request.Request(self.endpoint,data=body,headers={'Content-Type':'application/json','Accept':'application/json'},method='POST')
        try:
            with urllib.request.urlopen(req,timeout=15) as r: data=json.load(r)
        except (urllib.error.URLError,TimeoutError,json.JSONDecodeError) as e:
            raise DeliveryUpstreamError(str(e)) from e
        if not data.get('success'):
            errors=data.get('errors') or data.get('warnings') or ['Nova Poshta API error']
            raise DeliveryUpstreamError('; '.join(str(x) for x in errors))
        return data.get('data') or []

    def search_cities(self,q,limit=20):
        q=(q or '').strip()
        if len(q)<2:return []
        key=('cities',q.lower(),int(limit))
        def load():
            rows=self._call('Address','searchSettlements',{'CityName':q,'Limit':str(limit),'Page':'1'})
            out=[]
            for block in rows:
                for x in block.get('Addresses') or []:
                    ref=x.get('DeliveryCity') or x.get('Ref')
                    name=x.get('Present') or x.get('MainDescription')
                    if ref and name:
                        out.append({'ref':ref,'name':name,'region':x.get('Area') or x.get('Region'),'postal_code':None})
            return out[:limit]
        return _cached(key,300,load)


    def city_by_ref(self,city_ref):
        city_ref=(city_ref or '').strip()
        if not city_ref:return None
        rows=self._call('Address','getCities',{'Ref':city_ref,'Page':'1','Limit':'1'})
        if not rows:return None
        x=rows[0]
        ref=x.get('Ref') or city_ref
        name=x.get('Description') or x.get('DescriptionRu') or x.get('SettlementTypeDescription') or ref
        region=x.get('AreaDescription') or x.get('RegionDescription') or ''
        return {'ref':ref,'name':name,'region':region,'postal_code':None}

    def search_branches(self,city_ref,q='',limit=100):
        city_ref=(city_ref or '').strip(); q=(q or '').strip()
        if not city_ref:return []
        limit=max(1,min(int(limit),100))
        key=('branches',city_ref,q.lower(),limit)
        def load():
            props={'CityRef':city_ref,'Limit':str(limit),'Page':'1'}
            if q: props['FindByString']=q
            rows=self._call('Address','getWarehouses',props)
            out=[]
            for x in rows:
                desc=x.get('Description') or x.get('ShortAddress')
                ref=x.get('Ref')
                if ref and desc:
                    wt=(' '.join(str(x.get(k) or '') for k in ('CategoryOfWarehouse','TypeOfWarehouse','Description'))).lower()
                    service='locker' if ('поштомат' in wt or 'postomat' in wt) else 'branch'
                    out.append({'ref':ref,'name':desc,'number':x.get('Number'),'service':service,'address':x.get('ShortAddress') or desc})
            return out[:limit]
        return _cached(key,300,load)

