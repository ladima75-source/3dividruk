from __future__ import annotations
from dataclasses import dataclass
from typing import Any

class DeliveryError(RuntimeError):
    pass
class DeliveryNotConfigured(DeliveryError):
    pass
class DeliveryUpstreamError(DeliveryError):
    pass

@dataclass(frozen=True)
class DeliveryCapability:
    provider: str
    label: str
    configured: bool
    live_lookup: bool
    shipment_creation: bool
    tracking: bool
    services: tuple[str,...]

class DeliveryAdapter:
    provider='manual'
    label='Manual'
    def capability(self)->DeliveryCapability:
        return DeliveryCapability(self.provider,self.label,False,False,False,False,())
    def search_cities(self,q:str,limit:int=20)->list[dict[str,Any]]: return []
    def search_branches(self,city_ref:str|None,q:str,limit:int=30)->list[dict[str,Any]]: return []
    def create_shipment(self,order:dict[str,Any])->dict[str,Any]: raise DeliveryNotConfigured(self.provider)
    def track(self,tracking_number:str)->dict[str,Any]: raise DeliveryNotConfigured(self.provider)
