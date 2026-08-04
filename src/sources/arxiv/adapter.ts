import type { Item, ItemFull } from "../../core/schema.js";
import { collapseWs, trimTo } from "../../core/text.js";
import { asArray, type SourceAdapter } from "../types.js";
import { query, type ArxivEntry } from "./client.js";

const idOf = (e: ArxivEntry): string =>
  e.id.replace(/^https?:\/\/arxiv\.org\/abs\//, "").replace(/v\d+$/, "");

function authorsOf(e: ArxivEntry): string | undefined {
  const names = asArray(e.author).map((a) => a.name);
  if (!names.length) return undefined;
  return names.length > 3 ? `${names.slice(0, 3).join(", ")} 他` : names.join(", ");
}

function toItem(e: ArxivEntry): Item {
  const id = idOf(e);
  return {
    id: `arxiv:${id}`,
    source: "arxiv",
    type: "paper",
    title: collapseWs(String(e.title ?? "")),
    url: `https://arxiv.org/abs/${id}`,
    author: authorsOf(e),
    published_at: e.published,
    snippet: trimTo(String(e.summary ?? ""), 160),
  };
}

/** submittedDate範囲フィルタ用: YYYYMMDDHHMM */
const fmtDate = (d: Date): string =>
  d.toISOString().slice(0, 16).replace(/[-T:]/g, "");

export const arxiv: SourceAdapter = {
  name: "arxiv",
  capabilities: {
    search: true,
    trending: true,
    getItem: true,
    categories: ["cs.AI", "cs.CL", "cs.LG", "cs.SE", "cs.MA", "stat.ML"],
    notes: "trendingはカテゴリの新着（既定cs.AI）。レート礼儀3秒/リクエストのため連打しない",
  },

  async search(q) {
    const terms = q.query
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `all:${JSON.stringify(t)}`)
      .join(" AND ");
    const range = q.since
      ? ` AND submittedDate:[${fmtDate(q.since)} TO ${fmtDate(new Date())}]`
      : "";
    const entries = await query({
      search_query: `(${terms})${range}`,
      max_results: q.limit,
      sortBy: q.sort === "relevance" ? "relevance" : "submittedDate",
      sortOrder: "descending",
    });
    return entries.map(toItem);
  },

  async trending(q) {
    const entries = await query({
      search_query: `cat:${q.category ?? "cs.AI"}`,
      max_results: q.limit,
      sortBy: "submittedDate",
      sortOrder: "descending",
    });
    return entries.map(toItem);
  },

  async getItem(nativeId, opts) {
    const entries = await query({ id_list: nativeId, max_results: 1 });
    const e = entries[0];
    if (!e) throw new Error(`arXiv論文が見つかりません: ${nativeId}`);
    const categories = asArray(e.category).map((c) => c["@_term"]);
    return {
      ...toItem(e),
      body: trimTo(String(e.summary ?? ""), opts.maxLength),
      extra: {
        categories,
        pdf_url: `https://arxiv.org/pdf/${idOf(e)}`,
        updated: e.updated,
      },
    } satisfies ItemFull;
  },

  matchesUrl: (u) => /arxiv\.org\/(abs|pdf)\//.test(u),
  idFromUrl: (u) => {
    const m = u.match(/arxiv\.org\/(?:abs|pdf)\/([0-9.]+[0-9])/);
    return m?.[1];
  },
};
