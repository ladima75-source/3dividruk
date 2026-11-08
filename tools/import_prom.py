"""Import publicly visible 3DiViDruk product data from its Prom.ua storefront.

The importer is deliberately scoped to the owner's public 3dividruk.com.ua pages.
It does not log in, call private Prom APIs, bypass controls, or modify Prom.ua.
Run: python tools/import_prom.py
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import lxml.html

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = "https://3dividruk.com.ua"
CATEGORIES = (
    ("home-interior", "/ua/g141238021-dom-interer"),
    ("bags-magelle", "/ua/g147372660-sumki-magelle"),
)
HEADERS = {
    "User-Agent": "3DiViDrukCatalogMigration/1.0 (+https://github.com/ladima75-source/3dividruk)",
    "Accept-Language": "uk-UA,uk;q=0.9",
}


def request(url: str, retries: int = 3) -> tuple[bytes, str]:
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=35) as response:
                return response.read(), response.headers.get_content_type()
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last = exc
            time.sleep(0.6 * (attempt + 1))
    raise RuntimeError(f"Could not fetch {url}: {last}")


def document(url: str):
    payload, _ = request(url)
    return lxml.html.fromstring(payload.decode("utf-8", errors="replace"))


def discover_product_urls() -> tuple[list[str], list[dict]]:
    found: dict[str, str] = {}
    pages = []
    for category, path in CATEGORIES:
        empty = 0
        for page in range(1, 11):
            route = path if page == 1 else f"{path}/page_{page}"
            url = ORIGIN + route + "?product_items_per_page=48"
            try:
                dom = document(url)
            except RuntimeError as exc:
                pages.append({"url": url, "category": category, "page": page, "error": str(exc)})
                break
            links = []
            before = len(found)
            for anchor in dom.xpath('//a[starts-with(@id,"link_to_product_")]'):
                href = urllib.parse.urljoin(ORIGIN, anchor.get("href", ""))
                match = re.search(r"/ua/p(\d+)-", href)
                if match:
                    found.setdefault(match.group(1), href)
                    links.append(href)
            new_products = len(found) - before
            pages.append({"url": url, "category": category, "page": page, "products": len(set(links)), "newProducts": new_products})
            if not links:
                empty += 1
                if empty >= 1:
                    break
            else:
                empty = 0
            if page > 1 and new_products == 0:
                break
            # Prom sometimes adds pagination in the browser after the initial HTML.
            # Probe the next stable public page URL and stop only at the first empty page.
    return list(found.values()), pages


def product_jsonld(dom) -> dict:
    for script in dom.xpath('//script[@type="application/ld+json"]'):
        try:
            data = json.loads(script.text or "")
        except (TypeError, json.JSONDecodeError):
            continue
        rows = data if isinstance(data, list) else [data]
        for row in rows:
            if isinstance(row, dict) and row.get("@type") == "Product":
                return row
    raise ValueError("Product JSON-LD is missing")


def full_image_url(value: str) -> str:
    value = value.split("?", 1)[0]
    return re.sub(r"_w\d+_h\d+_", "_", value)


def image_id(url: str) -> str:
    name = Path(urllib.parse.urlparse(url).path).name
    return re.match(r"(\d+)_", name).group(1) if re.match(r"(\d+)_", name) else str(abs(hash(url)))


def sized_image_url(url: str, size: int = 700) -> str:
    url = full_image_url(url)
    parsed = urllib.parse.urlsplit(url)
    name = Path(parsed.path).name
    match = re.match(r"(\d+)_(.+)", name)
    if not match:
        return url
    sized = f"{match.group(1)}_w{size}_h{size}_{match.group(2)}"
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, str(Path(parsed.path).with_name(sized)).replace('\\','/'), "", ""))


def parse_attributes(dom) -> list[dict[str, str]]:
    result = []
    for row in dom.xpath('//table[contains(@class,"b-product-info")]//tr'):
        cells = [" ".join(c.text_content().split()) for c in row.xpath('./th|./td')]
        if len(cells) >= 2 and cells[0] and cells[1]:
            result.append({"name": cells[0], "value": cells[1]})
    if result:
        return result
    # Some Prom templates use definition-like div rows.
    for row in dom.xpath('//*[contains(@class,"b-product-info")]//*[contains(@class,"row")]'):
        cells = [" ".join(c.text_content().split()) for c in row.xpath('./*')]
        if len(cells) >= 2 and cells[0] and cells[-1]:
            result.append({"name": cells[0], "value": cells[-1]})
    return result


def parse_product(url: str) -> dict:
    dom = document(url)
    data = product_jsonld(dom)
    product_id = re.search(r"/p(\d+)-", url).group(1)
    offer = data.get("offers") or {}
    availability_url = str(offer.get("availability", "")).lower()
    availability = "in_stock" if "instock" in availability_url else "out_of_stock" if "outofstock" in availability_url else "preorder" if ("preorder" in availability_url or "backorder" in availability_url) else "unknown"
    gallery = []
    for img in dom.xpath('//img[contains(concat(" ",normalize-space(@class)," ")," cs-image-holder__image ")]'):
        source = img.get("src") or img.get("data-src") or ""
        if "images.prom.ua/" in source:
            source = full_image_url(source)
            if source not in gallery:
                gallery.append(source)
    lead = data.get("image")
    if isinstance(lead, list):
        lead = lead[0] if lead else ""
    if lead:
        lead = full_image_url(str(lead))
        gallery = [lead] + [x for x in gallery if image_id(x) != image_id(lead)]
    price = offer.get("price")
    return {
        "id": product_id,
        "sourceProductId": product_id,
        "sku": str(data.get("sku") or "").strip(),
        "title": " ".join(str(data.get("name") or "").split()),
        "description": str(data.get("description") or "").strip(),
        "price": float(price) if price not in (None, "") else None,
        "currency": str(offer.get("priceCurrency") or "UAH"),
        "availability": availability,
        "brand": str(data.get("brand") or "3DiViDruk"),
        "sourceUrl": url,
        "sourceCategory": " / ".join(
            " ".join(x.text_content().split())
            for x in dom.xpath('//script[@type="application/ld+json"]')[:0]
        ),
        "imageUrls": gallery[:8],
        "attributes": parse_attributes(dom),
    }


def download_one(product: dict, max_images: int) -> dict:
    folder = ROOT / "assets" / "products" / product["id"]
    folder.mkdir(parents=True, exist_ok=True)
    local = []
    failures = []
    for index, remote in enumerate(product.pop("imageUrls", [])[:max_images], 1):
        remote_sized = sized_image_url(remote)
        try:
            payload, content_type = request(remote_sized)
            if len(payload) < 1000 or len(payload) > 8_000_000 or not content_type.startswith("image/"):
                raise ValueError(f"unexpected {content_type}, {len(payload)} bytes")
            ext = mimetypes.guess_extension(content_type) or Path(urllib.parse.urlparse(remote).path).suffix or ".jpg"
            if ext == ".jpe":
                ext = ".jpg"
            path = folder / f"{index:02d}-{image_id(remote)}{ext}"
            path.write_bytes(payload)
            local.append(path.relative_to(ROOT).as_posix())
        except Exception as exc:
            failures.append({"url": remote_sized, "error": str(exc)})
            # Public HTTPS URL remains a usable, provenance-preserving fallback.
            local.append(sized_image_url(remote, 700))
    product["images"] = local
    product["imageImportFailures"] = failures
    return product


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--max-images", type=int, default=6)
    parser.add_argument("--skip-images", action="store_true")
    args = parser.parse_args()
    urls, pages = discover_product_urls()
    products, failures = [], []
    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 8))) as pool:
        futures = {pool.submit(parse_product, url): url for url in urls}
        for future in as_completed(futures):
            url = futures[future]
            try:
                products.append(future.result())
            except Exception as exc:
                failures.append({"url": url, "error": str(exc)})
    products.sort(key=lambda p: (p["sku"], p["id"]))
    duplicate_skus = sorted({p["sku"] for p in products if p["sku"] and sum(x["sku"] == p["sku"] for x in products) > 1})
    # Preserve the seller's exact displayed SKU. A separate commerce identity is
    # necessary when Prom contains duplicate or empty SKUs (currently SKU0285).
    for product in products:
        source_sku = product["sku"]
        product["commerceSku"] = (
            f"{source_sku}--{product['id']}" if source_sku in duplicate_skus
            else source_sku or f"PROM-{product['id']}"
        )
    if not args.skip_images:
        downloaded = []
        with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 8))) as pool:
            futures = {pool.submit(download_one, dict(p), args.max_images): p["id"] for p in products}
            for future in as_completed(futures):
                downloaded.append(future.result())
        products = sorted(downloaded, key=lambda p: (p["sku"], p["id"]))
    else:
        for p in products:
            p["images"] = [sized_image_url(x) for x in p.pop("imageUrls", [])]
            p["imageImportFailures"] = []
    catalog = {
        "store": "3DiViDruk",
        "source": ORIGIN + "/ua/",
        "importedAt": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "products": products,
    }
    data_dir = ROOT / "data"
    data_dir.mkdir(exist_ok=True)
    (data_dir / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    report = {
        "source": ORIGIN + "/ua/",
        "discovered": len(urls),
        "imported": len(products),
        "failedProducts": failures,
        "duplicateNonEmptySkus": duplicate_skus,
        "available": sum(p["availability"] == "in_stock" for p in products),
        "outOfStock": sum(p["availability"] == "out_of_stock" for p in products),
        "downloadedLocalImages": sum(x.startswith("assets/") for p in products for x in p["images"]),
        "imageFailures": sum(len(p["imageImportFailures"]) for p in products),
        "pages": pages,
        "scope": "Public storefront pages only; no login, private export, or write to Prom.ua.",
    }
    (data_dir / "import-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("discovered", "imported", "available", "outOfStock", "downloadedLocalImages", "imageFailures", "duplicateNonEmptySkus")}, ensure_ascii=False))
    if failures or len(products) < 100:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
