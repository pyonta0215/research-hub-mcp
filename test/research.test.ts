import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getItem, parseSince, search, trending } from "../src/services/research.js";
import { json, mockFetch, type FetchMock } from "./fetch-mock.js";

let mock: FetchMock | undefined;
afterEach(() => mock?.restore());

const hnHit = (id: string, url: string, points = 1) => ({
  objectID: id,
  title: `hn ${id}`,
  url,
  points,
  created_at: `2026-10-0${id}T00:00:00Z`,
});

const ghRepo = (name: string, stars: number) => ({
  full_name: name,
  html_url: `https://github.com/${name}`,
  owner: { login: name.split("/")[0] },
  created_at: "2026-10-05T00:00:00Z",
  stargazers_count: stars,
});

test("parseSince は相対指定とISO日付を受け、不正な値は理由付きで落とす", () => {
  const now = Date.now();
  const d = parseSince("2d")!;
  assert.ok(Math.abs(now - 2 * 86400_000 - d.getTime()) < 1000);
  assert.equal(parseSince("2026-07-01")!.toISOString(), "2026-07-01T00:00:00.000Z");
  assert.equal(parseSince(undefined), undefined);
  assert.throws(() => parseSince("yesterday"), /sinceの形式が不正です/);
});

test("search は同じURLを1件に畳み、吸収した側のidを also_on に残す", async () => {
  mock = mockFetch((u) => {
    if (u.host === "hn.algolia.com") {
      return json({ hits: [hnHit("1", "https://github.com/o/r?utm_source=hn"), hnHit("2", "https://x.test/a")] });
    }
    if (u.host === "api.github.com") return json({ items: [ghRepo("o/r", 10)] });
    return undefined;
  });
  const res = await search({ query: "mcp", sources: ["hackernews", "github"] });
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.stats, { hackernews: 2, github: 1 });
  // relevance はソースを交互に混ぜる: hn1, gh(o/r), hn2 → gh は hn1 と同じURLなので畳まれる
  assert.deepEqual(res.items.map((i) => i.id), ["hackernews:1", "hackernews:2"]);
  assert.deepEqual(res.items[0].also_on, ["github:o/r"]);
});

test("search は1ソースの失敗を errors に出し、他ソースの結果は返す", async () => {
  mock = mockFetch((u) => {
    if (u.host === "hn.algolia.com") return json({ message: "down" }, 503);
    if (u.host === "api.github.com") return json({ items: [ghRepo("a/b", 3), ghRepo("c/d", 9)] });
    return undefined;
  });
  const res = await search({ query: "x", sources: ["hackernews", "github"], sort: "score" });
  assert.equal(res.errors.length, 1);
  assert.match(res.errors[0], /^hackernews: HTTP 503/);
  assert.ok(res.hint);
  assert.deepEqual(res.items.map((i) => i.id), ["github:c/d", "github:a/b"]);
});

test("search は未知のソースを理由付きで拒否する", async () => {
  await assert.rejects(search({ query: "x", sources: ["bluesky"] }), /未知のソース: "bluesky"/);
});

test("trending は未知のソースを拒否する", async () => {
  await assert.rejects(trending({ source: "nope" }), /未知のソース/);
});

test("getItem はURLから担当ソースを判別する", async () => {
  mock = mockFetch((u) =>
    u.pathname === "/api/v1/items/42"
      ? json({ id: 42, title: "t", created_at: "2026-10-01T00:00:00Z", type: "story", children: [] })
      : undefined
  );
  const item = await getItem("https://news.ycombinator.com/item?id=42", 100);
  assert.equal(item.id, "hackernews:42");
});

test("getItem は source:id 以外の形式を理由付きで拒否する", async () => {
  await assert.rejects(getItem("41234567", 100), /source:id 形式/);
  await assert.rejects(getItem("bluesky:1", 100), /未知のソース/);
});
