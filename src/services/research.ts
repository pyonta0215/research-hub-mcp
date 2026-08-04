import type { Item, ItemFull, ResearchResult } from "../core/schema.js";
import { cache } from "../core/cache.js";
import { logger } from "../core/logger.js";
import { adapters, getAdapter } from "../sources/registry.js";
import type { SearchQuery, SourceAdapter } from "../sources/types.js";

// Service層: 並列取得・部分成功・重複排除・マージ。
// 1ソースの失敗で全体を失敗させない（errorsフィールドで明示する）。

export function parseSince(s?: string): Date | undefined {
  if (!s) return undefined;
  const rel = s.match(/^(\d+)([hdw])$/);
  if (rel) {
    const n = Number(rel[1]);
    const unitMs = { h: 3600_000, d: 86400_000, w: 7 * 86400_000 }[rel[2] as "h" | "d" | "w"];
    return new Date(Date.now() - n * unitMs);
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`sinceの形式が不正です: "${s}"。"24h" "7d" "2w" またはISO日付（2026-07-01）で指定してください`);
  }
  return d;
}

/** utm等を落としてURLを正規化（重複排除のキー） */
function canonUrl(u?: string): string | undefined {
  if (!u) return undefined;
  try {
    const url = new URL(u);
    url.hash = "";
    for (const k of [...url.searchParams.keys()]) {
      if (k.startsWith("utm_")) url.searchParams.delete(k);
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return u;
  }
}

/** 同一URLのItemを1つに畳み、吸収されたidをalso_onへ */
function dedup(items: Item[]): Item[] {
  const seen = new Map<string, Item>();
  const out: Item[] = [];
  for (const it of items) {
    const key = canonUrl(it.url) ?? it.id;
    const kept = seen.get(key);
    if (kept) {
      kept.also_on = [...(kept.also_on ?? []), it.id];
    } else {
      seen.set(key, it);
      out.push(it);
    }
  }
  return out;
}

/** sort=relevance ではソース間に優劣がないためラウンドロビンで交互に混ぜる */
function interleave(groups: Item[][]): Item[] {
  const out: Item[] = [];
  const max = Math.max(0, ...groups.map((g) => g.length));
  for (let i = 0; i < max; i++) {
    for (const g of groups) {
      if (g[i]) out.push(g[i]);
    }
  }
  return out;
}

function resolveAdapters(sources: string[] | undefined, cap: "search" | "trending"): SourceAdapter[] {
  const pool = sources?.length
    ? sources.map((s) => {
        const a = getAdapter(s);
        if (!a) throw new Error(`未知のソース: "${s}"。research_sourcesで利用可能なソースを確認してください`);
        return a;
      })
    : adapters;
  return pool.filter((a) => a.capabilities[cap]);
}

export interface SearchParams {
  query: string;
  sources?: string[];
  since?: string;
  limit?: number;
  sort?: "relevance" | "date" | "score";
}

export async function search(p: SearchParams): Promise<ResearchResult<Item>> {
  const cacheKey = `search:${JSON.stringify(p)}`;
  const cached = cache.get<ResearchResult<Item>>(cacheKey);
  if (cached) return cached;
  const targets = resolveAdapters(p.sources, "search");
  const q: SearchQuery = {
    query: p.query,
    since: parseSince(p.since),
    limit: p.limit ?? 8,
    sort: p.sort ?? "relevance",
  };
  const t0 = Date.now();
  const settled = await Promise.allSettled(targets.map((a) => a.search(q)));
  const groups: Item[][] = [];
  const stats: Record<string, number> = {};
  const errors: string[] = [];
  settled.forEach((s, i) => {
    const name = targets[i].name;
    if (s.status === "fulfilled") {
      groups.push(s.value);
      stats[name] = s.value.length;
    } else {
      errors.push(`${name}: ${String(s.reason instanceof Error ? s.reason.message : s.reason)}`);
      stats[name] = 0;
    }
  });
  let items = dedup(q.sort === "relevance" ? interleave(groups) : groups.flat());
  if (q.sort === "date") {
    items = items.sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
  } else if (q.sort === "score") {
    items = items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }
  logger.info({ op: "search", query: p.query, sources: targets.map((t) => t.name), hits: items.length, ms: Date.now() - t0 });
  const result: ResearchResult<Item> = {
    items,
    stats,
    errors,
    hint: errors.length
      ? "一部ソースが失敗しました。再試行するか、sourcesから該当ソースを外してください"
      : undefined,
  };
  // 部分失敗はキャッシュしない（次回の再試行で回復させる）
  if (!errors.length) cache.set(cacheKey, result, 5 * 60_000);
  return result;
}

export interface TrendingParams {
  source: string;
  category?: string;
  period?: "day" | "week";
  limit?: number;
}

export async function trending(p: TrendingParams): Promise<ResearchResult<Item>> {
  const a = getAdapter(p.source);
  if (!a) throw new Error(`未知のソース: "${p.source}"。research_sourcesで確認してください`);
  if (!a.capabilities.trending) throw new Error(`${p.source} はtrendingに対応していません`);
  return cache.getOrSet(`trending:${JSON.stringify(p)}`, 10 * 60_000, async () => {
    const items = await a.trending({
      category: p.category,
      period: p.period ?? "day",
      limit: p.limit ?? 10,
    });
    logger.info({ op: "trending", source: p.source, hits: items.length });
    return { items, stats: { [p.source]: items.length }, errors: [] };
  });
}

/** "source:native_id" または URL を受けて1件取得 */
export async function getItem(idOrUrl: string, maxLength: number): Promise<ItemFull> {
  if (/^https?:\/\//.test(idOrUrl)) {
    for (const a of adapters) {
      if (a.matchesUrl?.(idOrUrl)) {
        const nativeId = a.idFromUrl?.(idOrUrl);
        if (nativeId) {
          return cache.getOrSet(`item:${a.name}:${nativeId}:${maxLength}`, 15 * 60_000, () =>
            a.getItem(nativeId, { maxLength })
          );
        }
      }
    }
    // どのソースにも該当しないURLは汎用の記事抽出（rssアダプタ）にフォールバック
    const rss = getAdapter("rss");
    if (rss) {
      return cache.getOrSet(`item:web:${idOrUrl}:${maxLength}`, 15 * 60_000, () =>
        rss.getItem(idOrUrl, { maxLength })
      );
    }
    throw new Error(`URLを解決できるソースがありません: ${idOrUrl}`);
  }
  const sep = idOrUrl.indexOf(":");
  if (sep < 0) {
    throw new Error(`idの形式が不正です: "${idOrUrl}"。"hackernews:41234567" のような source:id 形式かURLを渡してください`);
  }
  const source = idOrUrl.slice(0, sep);
  const nativeId = idOrUrl.slice(sep + 1);
  const a = getAdapter(source);
  if (!a) throw new Error(`未知のソース: "${source}"。research_sourcesで確認してください`);
  return cache.getOrSet(`item:${idOrUrl}:${maxLength}`, 15 * 60_000, () =>
    a.getItem(nativeId, { maxLength })
  );
}
