// TTLキャッシュ。node:sqlite（Node 22.5+標準）で ~/.research-hub/cache.db に永続化し、
// 使えない環境ではインメモリに自動フォールバックする。
// 値はJSONで保存するため、キャッシュ対象は素のオブジェクトに限る。
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import path from "node:path";
import { logger } from "./logger.js";

export interface KV {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown, ttlMs: number): void;
  getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T>;
}

abstract class BaseCache implements KV {
  abstract get<T>(key: string): T | undefined;
  abstract set(key: string, value: unknown, ttlMs: number): void;

  async getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = this.get<T>(key);
    if (hit !== undefined) return hit;
    const v = await fn();
    if (v !== undefined) this.set(key, v, ttlMs);
    return v;
  }
}

export class TtlCache extends BaseCache {
  private store = new Map<string, { v: unknown; exp: number }>();

  get<T>(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.exp) {
      this.store.delete(key);
      return undefined;
    }
    return e.v as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    this.store.set(key, { v: value, exp: Date.now() + ttlMs });
  }
}

class SqliteCache extends BaseCache {
  // 型はnode:sqliteのDatabaseSyncだが、動的importのためanyで保持する
  private db: {
    exec(sql: string): void;
    prepare(sql: string): {
      get(...args: unknown[]): Record<string, unknown> | undefined;
      run(...args: unknown[]): unknown;
    };
  };

  constructor(dbPath: string, DatabaseSync: new (p: string) => SqliteCache["db"]) {
    super();
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, exp INTEGER NOT NULL)"
    );
    this.db.prepare("DELETE FROM cache WHERE exp < ?").run(Date.now());
  }

  get<T>(key: string): T | undefined {
    try {
      const row = this.db.prepare("SELECT value, exp FROM cache WHERE key = ?").get(key);
      if (!row) return undefined;
      if (Date.now() > Number(row.exp)) {
        this.db.prepare("DELETE FROM cache WHERE key = ?").run(key);
        return undefined;
      }
      return JSON.parse(String(row.value)) as T;
    } catch (e) {
      logger.warn({ op: "cache_get_failed", err: String(e) });
      return undefined;
    }
  }

  set(key: string, value: unknown, ttlMs: number): void {
    try {
      this.db
        .prepare("INSERT OR REPLACE INTO cache (key, value, exp) VALUES (?, ?, ?)")
        .run(key, JSON.stringify(value), Date.now() + ttlMs);
    } catch (e) {
      logger.warn({ op: "cache_set_failed", err: String(e) });
    }
  }
}

function createCache(): KV {
  if (process.env.RESEARCH_HUB_CACHE === "off") return new TtlCache();
  try {
    // node:sqliteが無いNode環境（<22.5）ではインメモリへフォールバック。
    // ESMのトップレベルでimportすると環境ごと落ちるため、createRequireで遅延解決する
    const req = createRequire(import.meta.url);
    const { DatabaseSync } = req("node:sqlite");
    const dbPath =
      process.env.RESEARCH_HUB_CACHE_DB ?? path.join(homedir(), ".research-hub", "cache.db");
    const c = new SqliteCache(dbPath, DatabaseSync);
    logger.debug({ op: "cache_backend", backend: "sqlite", path: dbPath });
    return c;
  } catch (e) {
    logger.warn({ op: "cache_backend", backend: "memory", reason: String(e) });
    return new TtlCache();
  }
}

export const cache: KV = createCache();
