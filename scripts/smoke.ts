// 実APIに対するスモークテスト: npm run smoke
// MCPを経由せずService層を直接叩き、全ソースの search/trending/get_item を検証する。
import * as research from "../src/services/research.js";

const show = (label: string, v: unknown) => {
  console.log(`\n===== ${label} =====`);
  console.log(JSON.stringify(v, null, 1).slice(0, 1200));
};

let failed = 0;
async function step(label: string, fn: () => Promise<unknown>) {
  try {
    show(label, await fn());
  } catch (e) {
    failed++;
    console.error(`\n!!!!! ${label} FAILED: ${String(e)}`);
  }
}

await step("trending hackernews (day)", () =>
  research.trending({ source: "hackernews", limit: 3 }));

await step("trending arxiv (cs.AI新着)", () =>
  research.trending({ source: "arxiv", limit: 3 }));

await step("trending rss (直近1週間)", () =>
  research.trending({ source: "rss", period: "week", limit: 5 }));

await step("search 横断 'MCP server' since 30d", () =>
  research.search({ query: "MCP server", since: "30d", limit: 3 }));

// get_item: trendingの1件目を実際に深掘りする
await step("get_item (HNフロントページ1件目)", async () => {
  const t = await research.trending({ source: "hackernews", limit: 1 });
  if (!t.items[0]) throw new Error("HN trendingが空");
  return research.getItem(t.items[0].id, 800);
});

await step("get_item (arXiv id指定)", () =>
  research.getItem("arxiv:1706.03762", 500)); // Attention Is All You Need

await step("get_item (RSS記事URL)", async () => {
  const t = await research.trending({ source: "rss", period: "week", limit: 1 });
  if (!t.items[0]) throw new Error("RSS trendingが空");
  return research.getItem(t.items[0].id, 600);
});

await step("trending github (直近1週間・typescript)", () =>
  research.trending({ source: "github", period: "week", category: "typescript", limit: 3 }));

await step("search github 'mcp server'", () =>
  research.search({ query: "mcp server", sources: ["github"], limit: 3, sort: "score" }));

await step("get_item (GitHubリポジトリ)", () =>
  research.getItem("github:modelcontextprotocol/typescript-sdk", 500));

await step("get_item (GitHub URL自動判別)", () =>
  research.getItem("https://github.com/anthropics/claude-code", 300));

console.log(`\n===== smoke done: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`} =====`);
process.exit(failed === 0 ? 0 : 1);
