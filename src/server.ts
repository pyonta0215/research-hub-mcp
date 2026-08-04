import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { loadFeeds, feedsPath } from "./core/config.js";
import { adapters, adapterNames } from "./sources/registry.js";
import * as research from "./services/research.js";

// レスポンスはJSON文字列で返す（youtube-mcpと同じ流儀）。
// インデント1でトークンを節約しつつ可読性を保つ。
const ok = (obj: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(obj, null, 1) }],
});
const fail = (e: unknown) => ({
  content: [{ type: "text" as const, text: e instanceof Error ? e.message : String(e) }],
  isError: true as const,
});

export function createServer(): McpServer {
  const server = new McpServer({ name: "research-hub", version: "0.1.0" });

  server.registerTool(
    "research_search",
    {
      title: "横断検索",
      description:
        `複数の情報ソース（${adapterNames.join("/")}）をキーワードで横断検索し、統一スキーマで返す。` +
        "技術動向・論文・記事のリサーチはまずこれ。結果のitems[].idをresearch_get_itemに渡すと深掘りできる。" +
        "HN/arXivは英語クエリ推奨。rssは購読フィード内検索（Web全体ではない）",
      inputSchema: {
        query: z.string().min(1).describe("検索キーワード（英語推奨）"),
        sources: z
          .array(z.string())
          .optional()
          .describe(`対象ソース。省略時は全ソース。候補: ${adapterNames.join(", ")}`),
        since: z.string().optional().describe('期間の下限。"24h" "7d" "2w" またはISO日付'),
        limit: z.number().int().min(1).max(30).optional().describe("ソースあたり最大件数（既定8）"),
        sort: z
          .enum(["relevance", "date", "score"])
          .optional()
          .describe("既定relevance（ソース間はラウンドロビン混合）"),
      },
    },
    async (args) => {
      try {
        return ok(await research.search(args));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "research_trending",
    {
      title: "トレンド取得",
      description:
        "1つのソースの「今熱いもの」を取得する。hackernews=フロントページ、arxiv=カテゴリ新着（既定cs.AI）、" +
        "rss=購読フィードの直近記事。ソースごとにランキングの意味が違うため複数ソースは別々に呼ぶこと",
      inputSchema: {
        source: z.string().describe(`ソース名。候補: ${adapterNames.join(", ")}`),
        category: z
          .string()
          .optional()
          .describe("ソース固有の絞り込み。arxiv: cs.AI等のカテゴリ / rss: フィード名"),
        period: z.enum(["day", "week"]).optional().describe("既定day"),
        limit: z.number().int().min(1).max(30).optional().describe("最大件数（既定10）"),
      },
    },
    async (args) => {
      try {
        return ok(await research.trending(args));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "research_get_item",
    {
      title: "1件の深掘り",
      description:
        "search/trendingで見つけた1件の中身を取る。HN=本文＋上位コメント、arXiv=アブストラクト全文、" +
        "RSS/一般URL=記事本文の抽出。idは items[].id（例: hackernews:41234567）かURLをそのまま渡す",
      inputSchema: {
        id: z.string().describe('"source:native_id" 形式のid、またはURL'),
        max_length: z
          .number()
          .int()
          .min(200)
          .max(20000)
          .optional()
          .describe("本文の最大文字数（既定3000）"),
      },
    },
    async (args) => {
      try {
        return ok(await research.getItem(args.id, args.max_length ?? 3000));
      } catch (e) {
        return fail(e);
      }
    }
  );

  server.registerTool(
    "research_sources",
    {
      title: "ソース一覧",
      description:
        "利用可能なソースと各ソースの能力（search/trending/getItem対応・カテゴリ語彙・注意点）、RSS購読リストを返す。" +
        "どのソースに何を聞けるか迷ったらまずこれ",
      inputSchema: {},
    },
    async () => {
      try {
        return ok({
          sources: adapters.map((a) => ({ name: a.name, ...a.capabilities })),
          rss_feeds: loadFeeds(),
          rss_feeds_path: feedsPath(),
        });
      } catch (e) {
        return fail(e);
      }
    }
  );

  return server;
}
