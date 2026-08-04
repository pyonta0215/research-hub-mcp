import type { Item, ItemFull } from "../../core/schema.js";
import { stripHtml, trimTo } from "../../core/text.js";
import type { SourceAdapter } from "../types.js";
import { getItemTree, searchStories, type HnHit } from "./client.js";

const threadUrl = (id: string | number) => `https://news.ycombinator.com/item?id=${id}`;

function toItem(h: HnHit): Item {
  return {
    id: `hackernews:${h.objectID}`,
    source: "hackernews",
    type: "discussion",
    title: h.title ?? "(no title)",
    url: h.url ?? threadUrl(h.objectID),
    discussion_url: threadUrl(h.objectID),
    author: h.author ?? undefined,
    published_at: h.created_at,
    score: h.points ?? undefined,
    num_comments: h.num_comments ?? undefined,
    snippet: h.story_text ? trimTo(stripHtml(h.story_text), 120) : undefined,
  };
}

export const hackernews: SourceAdapter = {
  name: "hackernews",
  capabilities: {
    search: true,
    trending: true,
    getItem: true,
    notes:
      'trendingはperiod:"day"で現在のフロントページ、"week"で直近7日の高スコア。categoryは未使用',
  },

  async search(q) {
    const numericFilters = q.since
      ? `created_at_i>${Math.floor(q.since.getTime() / 1000)}`
      : undefined;
    const res = await searchStories({
      query: q.query,
      tags: "story",
      numericFilters,
      byDate: q.sort === "date",
      hitsPerPage: q.limit,
    });
    let hits = res.hits;
    if (q.sort === "score") {
      hits = [...hits].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
    }
    return hits.map(toItem);
  },

  async trending(q) {
    if (q.period === "week") {
      const since = Math.floor(Date.now() / 1000) - 7 * 86400;
      const res = await searchStories({
        tags: "story",
        numericFilters: `created_at_i>${since}`,
        hitsPerPage: Math.min(q.limit * 3, 60),
      });
      return res.hits
        .sort((a, b) => (b.points ?? 0) - (a.points ?? 0))
        .slice(0, q.limit)
        .map(toItem);
    }
    const res = await searchStories({ tags: "front_page", hitsPerPage: q.limit });
    return res.hits.map(toItem);
  },

  async getItem(nativeId, opts) {
    const it = await getItemTree(nativeId);
    // Algolia itemsのchildrenはランク順。上位コメントを本文抜粋として返す
    const highlights = (it.children ?? [])
      .filter((c) => c.text)
      .slice(0, 10)
      .map((c) => `${c.author ?? "?"}: ${trimTo(stripHtml(c.text!), 280)}`);
    return {
      id: `hackernews:${it.id}`,
      source: "hackernews",
      type: "discussion",
      title: it.title ?? "(no title)",
      url: it.url ?? threadUrl(it.id),
      discussion_url: threadUrl(it.id),
      author: it.author ?? undefined,
      published_at: it.created_at,
      score: it.points ?? undefined,
      num_comments: it.children?.length,
      body: it.text ? trimTo(stripHtml(it.text), opts.maxLength) : undefined,
      highlights,
      extra: {},
    } satisfies ItemFull;
  },

  matchesUrl: (u) => u.includes("news.ycombinator.com/item"),
  idFromUrl: (u) => {
    try {
      return new URL(u).searchParams.get("id") ?? undefined;
    } catch {
      return undefined;
    }
  },
};
