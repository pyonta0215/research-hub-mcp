import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { fetchFeed } from "../src/sources/rss/client.js";
import { rss } from "../src/sources/rss/adapter.js";
import { mockFetch, text, type FetchMock } from "./fetch-mock.js";

const RSS2 = `<?xml version="1.0"?><rss version="2.0"><channel>
<item><title>RSS &#x8A18;&#x4E8B;</title><link>https://a.test/1</link>
<pubDate>Mon, 05 Oct 2026 01:00:00 GMT</pubDate><description>&lt;p&gt;agent memory design&lt;/p&gt;</description></item>
<item><title>no link</title></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><title>Atom entry</title>
<link rel="replies" href="https://b.test/1#comments"/><link rel="alternate" href="https://b.test/1"/>
<updated>2026-10-06T00:00:00Z</updated><summary>Agent harness notes</summary></entry>
</feed>`;

const RDF = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/">
<item><title>RDF item</title><link>https://c.test/1</link><dc:date>2026-10-04T00:00:00+09:00</dc:date></item>
</rdf:RDF>`;

const FEEDS: Record<string, string> = {
  "/rss2.xml": RSS2,
  "/atom.xml": ATOM,
  "/rdf.xml": RDF,
};

let mock: FetchMock | undefined;
afterEach(() => mock?.restore());

const serveFeeds = () =>
  mockFetch((u) => {
    if (u.host === "feeds.test") return text(FEEDS[u.pathname] ?? "", FEEDS[u.pathname] ? 200 : 404);
    if (u.host === "a.test") {
      return text("<html><title>Page</title><nav>menu</nav><article><p>Body text</p></article></html>");
    }
    return undefined;
  });

test("RSS 2.0 を正規化し、linkのない項目を捨てる", async () => {
  mock = serveFeeds();
  const entries = await fetchFeed({ name: "rss2", url: "https://feeds.test/rss2.xml" });
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], {
    title: "RSS 記事",
    link: "https://a.test/1",
    published: "2026-10-05T01:00:00.000Z",
    summary: "agent memory design",
    feedName: "rss2",
  });
});

test("Atom は rel=alternate のリンクを選ぶ", async () => {
  mock = serveFeeds();
  const [e] = await fetchFeed({ name: "atom", url: "https://feeds.test/atom.xml" });
  assert.equal(e.link, "https://b.test/1");
  assert.equal(e.published, "2026-10-06T00:00:00.000Z");
});

test("RSS 1.0 (RDF) の dc:date を ISO にする", async () => {
  mock = serveFeeds();
  const [e] = await fetchFeed({ name: "rdf", url: "https://feeds.test/rdf.xml" });
  assert.equal(e.link, "https://c.test/1");
  assert.equal(e.published, "2026-10-03T15:00:00.000Z");
});

test("search は全語を含む項目だけを新しい順に返す", async () => {
  mock = serveFeeds();
  const items = await rss.search({ query: "agent", limit: 10, sort: "date" });
  assert.deepEqual(
    items.map((i) => i.id),
    ["rss:https://b.test/1", "rss:https://a.test/1"]
  );
  const narrowed = await rss.search({ query: "agent memory", limit: 10, sort: "date" });
  assert.deepEqual(narrowed.map((i) => i.id), ["rss:https://a.test/1"]);
});

test("1フィードが落ちても他のフィードの結果は返る", async () => {
  mock = mockFetch((u) => (u.pathname === "/atom.xml" ? text(ATOM) : text("boom", 500)));
  const items = await rss.search({ query: "atom", limit: 10, sort: "date" });
  assert.deepEqual(items.map((i) => i.id), ["rss:https://b.test/1"]);
});

test("getItem は article 要素を本文にし、フィードのタイトルで補う", async () => {
  mock = serveFeeds();
  const item = await rss.getItem("https://a.test/1", { maxLength: 100 });
  assert.equal(item.title, "RSS 記事");
  assert.equal(item.body, "Body text");
  assert.equal(item.author, "rss2");
});
