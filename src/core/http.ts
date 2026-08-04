import { logger } from "./logger.js";

// アダプタごとのレート礼儀（arXiv: 3秒間隔など）を宣言的に守るfetchラッパ。
const lastCallAt = new Map<string, number>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchOpts {
  /** 同じキー同士で minIntervalMs の間隔を保証する */
  rateKey?: string;
  minIntervalMs?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  retries?: number;
}

export async function politeFetch(url: string, opts: FetchOpts = {}): Promise<Response> {
  const { rateKey, minIntervalMs = 0, timeoutMs = 15000, headers = {}, retries = 1 } = opts;
  if (rateKey && minIntervalMs > 0) {
    const wait = (lastCallAt.get(rateKey) ?? 0) + minIntervalMs - Date.now();
    if (wait > 0) await sleep(wait);
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (rateKey) lastCallAt.set(rateKey, Date.now());
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "research-hub-mcp/0.1", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
      logger.debug({ op: "fetch", url, status: res.status, ms: Date.now() - t0 });
      if (res.status >= 500 && attempt < retries) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(500);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e;
      logger.debug({ op: "fetch_error", url, attempt, err: String(e) });
      if (attempt < retries) await sleep(500);
    }
  }
  throw lastErr;
}

export async function fetchJson<T>(url: string, opts?: FetchOpts): Promise<T> {
  const res = await politeFetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

export async function fetchText(url: string, opts?: FetchOpts): Promise<string> {
  const res = await politeFetch(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}
