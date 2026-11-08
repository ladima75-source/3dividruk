# Reuse from BB610 Market

Source: `https://github.com/ladima75-source/bb610-market`, source checkout `main` at `2768e6fe30f95e272453384cec86eb2a09970612`, read on 2026-11-08. Existing repository and runtime were not modified.

| Original | New file | Reuse |
|---|---|---|
| `backend/db.py` | `backend/db.py` | SQLite connection/WAL/foreign-key pattern; separate variables, path and schema |
| `backend/services/orders.py` | `backend/orders.py` | Adapted actual lifecycle transitions, request/token hashing, snapshot/price/idempotency structure and status history; random status tokens replace development-secret fallback |
| `backend/services/payment/base.py` | `backend/services/payment/base.py` | Copied provider interface and exceptions |
| `backend/services/payment/unconfigured.py` | same relative path | Copied disabled provider implementation |
| `backend/services/delivery/base.py` | same relative path | Copied adapter/capability interface |
| `backend/services/delivery/nova_poshta.py` | same relative path | Copied cache, official lookup parser and city/branch search methods; config uses only DIVIDRUK variables, shipment/tracking capabilities disabled; mutation methods removed |
| `admin/admin-shell.css` | `admin/admin-shell.css` | Copied responsive sidebar/layout rules, renamed class/variable prefix and adapted colors |
| `admin/admin.js` | `admin/admin.js` | Adapted request timeout, safe text escaping, money/status labels, order list/detail/status and tab patterns; no remembered tokens/API endpoint |

The complete old application was not copied: its historical agriculture catalog, migrations/tools, customer data, integration settings, keys, analytics IDs, production URLs and runtime files were excluded. The admin is a smaller working adaptation for the imported catalog, orders and settings; it does not claim feature parity with every historical BB610 admin module.

All online acquiring remains disabled. The original Mono adapter, invoice creation, webhook configuration, messaging and shipment creation were deliberately not included.
