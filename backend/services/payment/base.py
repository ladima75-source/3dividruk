from __future__ import annotations
from dataclasses import dataclass
from typing import Any

class PaymentError(RuntimeError): pass
class PaymentNotConfigured(PaymentError): pass
class PaymentSignatureError(PaymentError): pass

@dataclass
class PaymentSession:
    provider: str
    provider_payment_id: str | None
    redirect_url: str | None
    status: str = 'requires_action'
    raw: dict[str,Any] | None = None

@dataclass
class PaymentWebhookEvent:
    provider_event_id: str
    provider_payment_id: str | None
    order_id: str | None
    status: str
    event_type: str
    raw: dict[str,Any]

class PaymentAdapter:
    provider='unconfigured'
    def configured(self)->bool:return False
    def create_session(self,*,order_id:str,order_number:str,amount:float,currency:str,return_url:str,customer:dict)->PaymentSession:
        raise PaymentNotConfigured('Online payment provider is not configured')
    def parse_webhook(self,headers:dict[str,str],body:bytes)->PaymentWebhookEvent:
        raise PaymentNotConfigured('Online payment provider is not configured')
