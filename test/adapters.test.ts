import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { arxiv } from "../src/sources/arxiv/adapter.js";
import { github } from "../src/sources/github/adapter.js";
import { hackernews } from "../src/sources/hackernews/adapter.js";
import { json, mockFetch, text, type FetchMock } from "./fetch-mock.js";

let mock: FetchMock | undefined;
afterEach(() => mock?.restore());

test("hackernews: URLのないストーリーはスレッドURLを使い、score順に並べ替える", async () => {
  mock = mockFetch(() =>
    json({
      hits: [
        { objectID: "1", title: "low", url: "https://x.test/a", points: 3, created_at: "2026-10-01T00:00:00Z" },
        { objectID: "2", title: "ask", points: 50, created_at: "2026-10-02T00:00:00Z", story_text: "<p>hi</p>" },
      ],
    })
  );
  const items = await hackernews.search({ query: "mcp", limit: 2, sort: "score" });
  assert.deepEqual(items.map((i) => i.id), ["hackernews:2", "hackernews:1"]);
  assert.equal(items[0].url, "https://news.ycombinator.com/item?id=2");
  assert.equal(items[0].snippet, "hi");
  const u = new URL(mock.calls[0]);
  assert.equal(u.pathname, "/api/v1/search");
  assert.equal(u.searchParams.get("query"), "mcp");
});

test("hackernews: sort=date は search_by_date を呼び、since を numericFilters にする", async () => {
  mock = mockFetch(() => json({ hits: [] }));
  await hackernews.search({ query: "x", limit: 1, sort: "date", since: new Date("2026-10-01T00:00:00Z") });
  const u = new URL(mock.calls[0]);
  assert.equal(u.pathname, "/api/v1/search_by_date");
  assert.equal(u.searchParams.get("numericFilters"), "created_at_i>1790812800");
});

test("hackernews: idFromUrl / matchesUrl", () => {
  assert.equal(hackernews.idFromUrl?.("https://news.ycombinator.com/item?id=42"), "42");
  assert.equal(hackernews.matchesUrl?.("https://example.com/item?id=42"), false);
});

test("github: getItem は repo・README・release を1件にまとめる", async () => {
  mock = mockFetch((u) => {
    if (u.pathname === "/repos/o/r") {
      return json({
        full_name: "o/r",
        html_url: "https://github.com/o/r",
        owner: { login: "o" },
        created_at: "2026-01-01T00:00:00Z",
        stargazers_count: 7,
        forks_count: 1,
        open_issues_count: 0,
        description: "desc",
        language: "TypeScript",
        license: { spdx_id: "MIT" },
        topics: ["mcp"],
      });
    }
    if (u.pathname === "/repos/o/r/readme") return text("# README body");
    if (u.pathname === "/repos/o/r/releases/latest") return json({ message: "Not Found" }, 404);
    return undefined;
  });
  const item = await github.getItem("o/r", { maxLength: 100 });
  assert.equal(item.id, "github:o/r");
  assert.equal(item.body, "# README body");
  assert.equal(item.extra?.license, "MIT");
  assert.equal(item.extra?.latest_release, undefined);
});

test("github: idFromUrl は .git とパスの残りを落とす", () => {
  assert.equal(github.idFromUrl?.("https://github.com/o/r.git"), "o/r");
  assert.equal(github.idFromUrl?.("https://github.com/o/r#readme"), "o/r");
});

test("arxiv: バージョン番号を落とし、著者が4人以上なら省略する", async () => {
  mock = mockFetch(() =>
    text(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
<id>http://arxiv.org/abs/2610.01234v2</id><title>  A   paper </title><summary>abstract</summary>
<published>2026-10-01T00:00:00Z</published>
<author><name>A</name></author><author><name>B</name></author><author><name>C</name></author><author><name>D</name></author>
</entry></feed>`)
  );
  const [item] = await arxiv.search({ query: "agent memory", limit: 1, sort: "relevance" });
  assert.equal(item.id, "arxiv:2610.01234");
  assert.equal(item.title, "A paper");
  assert.equal(item.author, "A, B, C 他");
  const q = new URL(mock.calls[0]).searchParams.get("search_query");
  assert.equal(q, '(all:"agent" AND all:"memory")');
});

test("arxiv: idFromUrl は abs と pdf の両方を受ける", () => {
  assert.equal(arxiv.idFromUrl?.("https://arxiv.org/abs/2610.01234v2"), "2610.01234");
  assert.equal(arxiv.idFromUrl?.("https://arxiv.org/pdf/2610.01234"), "2610.01234");
});
