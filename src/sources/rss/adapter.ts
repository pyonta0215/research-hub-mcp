import type { Item, ItemFull } from "../../core/schema.js";
import { loadFeeds } from "../../core/config.js";
import { fetchText } from "../../core/http.js";
import { logger } from "../../core/logger.js";
import { stripHtml, trimTo } from "../../core/text.js";
import type { SourceAdapter } from "../types.js";
import { fetchFeed, type FeedEntry } from "./client.js";

// idは "rss:<記事URL>"。get_itemは記事ページ本文をその場で抽出する。

function toItem(e: FeedEntry): Item {
  return {
    id: `rss:${e.link}`,
    source: "rss",
    type: "article",
    title: e.title,
    url: e.link,
    author: e.feedName,
    published_at: e.published,
    snippet: e.summary ? trimTo(e.summary, 120) : undefined,
  };
}

async function allEntries(): Promise<FeedEntry[]> {
  const feeds = loadFeeds();
  const settled = await Promise.allSettled(feeds.map(fetchFeed));
  const entries: FeedEntry[] = [];
  settled.forEach((s, i) => {
    if (s.status === "fulfilled") entries.push(...s.value);
    else logger.warn({ op: "rss_feed_failed", feed: feeds[i]?.name, err: String(s.reason) });
  });
  return entries;
}

const byDateDesc = (a: FeedEntry, b: FeedEntry) =>
  (b.published ?? "").localeCompare(a.published ?? "");

/** 記事HTMLから本文らしきテキストを抽出（MVPは簡易版: article要素優先の全文strip） */
function extractBody(html: string, maxLength: number): string | undefined {
  const article = html.match(/<article[\s\S]*?<\/article>/i)?.[0];
  const main = article ?? html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html;
  return trimTo(stripHtml(main), maxLength);
}

export const rss: SourceAdapter = {
  name: "rss",
  capabilities: {
    search: true,
    trending: true,
    getItem: true,
    categories: loadFeeds().map((f) => f.name),
    notes:
      "検索は購読フィード内の全文一致（Web全体ではない）。categoryにフィード名を渡すと絞り込み。購読リストは config/feeds.json",
  },

  async search(q) {
    const terms = q.query.toLowerCase().split(/\s+/).filter(Boolean);
    const entries = (await allEntries()).filter((e) => {
      const hay = `${e.title} ${e.summary ?? ""}`.toLowerCase();
      if (!terms.every((t) => hay.includes(t))) return false;
      if (q.since && e.published && new Date(e.published) < q.since) return false;
      return true;
    });
    return entries.sort(byDateDesc).slice(0, q.limit).map(toItem);
  },

  async trending(q) {
    const cutoff = Date.now() - (q.period === "week" ? 7 : 1) * 86400_000;
    let entries = await allEntries();
    if (q.category) entries = entries.filter((e) => e.feedName === q.category);
    const recent = entries.filter((e) => !e.published || new Date(e.published).getTime() > cutoff);
    return recent.sort(byDateDesc).slice(0, q.limit).map(toItem);
  },

  async getItem(nativeId, opts) {
    const url = nativeId;
    const html = await fetchText(url, { timeoutMs: 15000 });
    const title = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? url);
    // フィードのメタ情報が取れれば補完する
    const known = (await allEntries()).find((e) => e.link === url);
    return {
      id: `rss:${url}`,
      source: "rss",
      type: "article",
      title: known?.title ?? title,
      url,
      author: known?.feedName,
      published_at: known?.published,
      body: extractBody(html, opts.maxLength),
      extra: {},
    } satisfies ItemFull;
  },
};
