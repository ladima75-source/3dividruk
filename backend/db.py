"""SQLite connection pattern adapted from BB610 Market backend/db.py.

Only DIVIDRUK_DB_PATH is read. No database or runtime from BB610 is imported.
"""
from __future__ import annotations
import os
import sqlite3
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

class ClosingConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc, traceback):
        try:
            return super().__exit__(exc_type, exc, traceback)
        finally:
            self.close()

def database_path():
    return Path(os.environ.get('DIVIDRUK_DB_PATH') or str(BASE_DIR / 'runtime' / '3dividruk.sqlite3'))

def connect():
    path = database_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=15, factory=ClosingConnection)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA foreign_keys = ON')
    con.execute('PRAGMA journal_mode = WAL')
    return con

def migrate():
    with connect() as con:
        con.executescript('''
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY, order_number TEXT NOT NULL UNIQUE,
          public_token_hash TEXT NOT NULL, created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL, status TEXT NOT NULL, currency TEXT NOT NULL,
          subtotal_minor INTEGER NOT NULL, customer_json TEXT NOT NULL,
          fulfillment_json TEXT NOT NULL, items_json TEXT NOT NULL,
          comment TEXT NOT NULL, test_order INTEGER NOT NULL,
          tracking_number TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS idempotency_keys (
          key TEXT PRIMARY KEY, request_hash TEXT NOT NULL, order_id TEXT NOT NULL,
          public_token TEXT NOT NULL,
          FOREIGN KEY(order_id) REFERENCES orders(id)
        );
        CREATE TABLE IF NOT EXISTS order_status_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL,
          from_status TEXT, to_status TEXT NOT NULL, note TEXT NOT NULL,
          created_at TEXT NOT NULL, FOREIGN KEY(order_id) REFERENCES orders(id)
        );
        CREATE TABLE IF NOT EXISTS product_overrides (
          sku TEXT PRIMARY KEY, data_json TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS store_settings (
          key TEXT PRIMARY KEY, value_json TEXT NOT NULL
        );
        ''')
