# research-hub-mcp

A research hub MCP server for AI agents. Search, browse trends, and dig into **Hacker News, arXiv, GitHub, and RSS feeds** through 4 unified tools with a single normalized schema.

Instead of wrapping each API as a separate MCP server (and paying the context-window cost of 30+ tool definitions), research-hub bundles sources as adapters behind three verbs an agent actually needs: **search, trending, get_item**.

- Zero cost: only free, no-auth APIs (a GitHub token is optional, for higher rate limits)
- Token-efficient: compact list items (~200 bytes each), full detail on demand, body truncation
- Resilient: one failing source never fails the whole call (partial results + `errors` field)
- Persistent cache: SQLite (`~/.research-hub/cache.db`) via `node:sqlite`, with in-memory fallback

## Tools

| Tool | What it does |
| --- | --- |
| `research_search` | Cross-source keyword search (parallel fetch, dedup, unified items) |
| `research_trending` | What's hot per source: HN front page / arXiv new listings / GitHub fast-rising repos / recent RSS |
| `research_get_item` | Deep-dive one item: HN top comments, arXiv abstract, GitHub README + latest release, article body extraction for any URL |
| `research_sources` | Self-describing capability list (sources, categories, RSS subscriptions) |

## Quick start

```bash
git clone https://github.com/pyonta0215/research-hub-mcp.git
cd research-hub-mcp
npm install && npm run build
```

Register with Claude Code:

```bash
claude mcp add research-hub -- node /path/to/research-hub-mcp/dist/index.js
```

Or Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "research-hub": {
      "command": "node",
      "args": ["/path/to/research-hub-mcp/dist/index.js"]
    }
  }
}
```

## Example prompts

- "Find recent discussions about MCP server design" → `research_search {query:"MCP server", since:"30d"}`
- "Anything interesting on HN today?" → `research_trending {source:"hackernews"}`
- "What are people saying in that thread?" → `research_get_item {id:"hackernews:41234567"}`
- "Fast-rising TypeScript repos this week" → `research_trending {source:"github", category:"typescript", period:"week"}`

## Configuration

Everything is optional.

| Setting | How | Effect |
| --- | --- | --- |
| GitHub token | `GITHUB_TOKEN` / `GH_TOKEN` env, or just be logged in to `gh` CLI (auto-detected) | Search rate 10/min → 30/min |
| RSS subscriptions | edit `config/feeds.json`, or point `RESEARCH_HUB_FEEDS` to your own file | Which feeds `rss` covers |
| Cache | `RESEARCH_HUB_CACHE=off`, `RESEARCH_HUB_CACHE_DB=/path` | Disable / relocate SQLite cache |
| Logging | `RESEARCH_LOG=debug` | Structured JSON logs on stderr |

`config/feeds.json` (RSS 2.0 / Atom / RSS 1.0 RDF all supported):

```json
[
  { "name": "zenn", "url": "https://zenn.dev/feed" },
  { "name": "hatena-it", "url": "https://b.hatena.ne.jp/hotentry/it.rss" }
]
```

## Response shape

Every tool returns the same envelope and item schema:

```json
{
 "items": [
  {
   "id": "hackernews:41234567",
   "source": "hackernews",
   "type": "discussion",
   "title": "...",
   "url": "https://...",
   "published_at": "2026-08-03T21:04:00Z",
   "score": 342,
   "num_comments": 128,
   "snippet": "..."
  }
 ],
 "stats": { "hackernews": 5, "arxiv": 3 },
 "errors": []
}
```

- `items[].id` can be passed straight to `research_get_item`
- `score` is source-relative and deliberately not normalized across sources
- Source-specific fields live in `extra` (full form only)

## Adding a source

1. Create `src/sources/<name>/{client.ts,adapter.ts}` implementing `SourceAdapter` (see `src/sources/types.ts`)
2. Add one line to `src/sources/registry.ts`

Tool definitions, the service layer, and the schema stay untouched. Planned next: Bluesky. Deliberately not planned: X/Twitter (read API starts at $200/month).

## Design notes

- High-level "intent" tools (e.g. `collect_ai_news`) are intentionally absent: summarizing and combining is the agent's job; this server does normalized retrieval only.
- Rate courtesy is declared per adapter (arXiv 3s interval, GitHub header-aware self-limit).
- Logs go to stderr as JSON lines (stdout is reserved for the MCP protocol).

## Development

```bash
npm run smoke   # live-API smoke test across all sources
npm run dev     # run from source with tsx
```

## License

MIT

---

## 日本語での概要

AIエージェント向けの情報収集ハブMCPサーバーです。Hacker News・arXiv・GitHub・RSSを、統一スキーマの4ツール（横断検索 / トレンド / 深掘り / ソース一覧）で扱えます。

- 無料・無認証のAPIのみで運用コスト¥0（GitHubトークンは任意、`gh` CLIログインがあれば自動検出）
- 個別APIラッパーを量産せず、「探す・眺める・深掘る」の3動詞に集約したハブ型設計
- RSS購読リスト（`config/feeds.json`）はZenn・はてなブックマークなど日本語フィードにも対応
- 要約・分析はエージェント側（スキル/プロンプト）の仕事とし、本サーバーは「取得の正規化」に徹します
