import assert from "node:assert/strict";
import { test } from "node:test";
import { collapseWs, stripHtml, trimTo } from "../src/core/text.js";

test("stripHtml はタグとscript/styleを落とし、空白を畳む", () => {
  const html = "<p>Hello <b>world</b></p><script>alert(1)</script><style>p{}</style>\n\n end";
  assert.equal(stripHtml(html), "Hello world end");
});

test("stripHtml は数値文字参照を名前付きより先に解決する（日本語フィード対策）", () => {
  assert.equal(stripHtml("&#x30A2;&#12452; &amp; &lt;tag&gt;"), "アイ & <tag>");
});

test("stripHtml は範囲外のコードポイントで落ちない", () => {
  assert.equal(stripHtml("a&#x110000;b"), "a b");
});

test("trimTo は上限で切って省略記号を付ける", () => {
  assert.equal(trimTo("abcdef", 3), "abc…");
  assert.equal(trimTo("abc", 3), "abc");
});

test("trimTo は空・空白のみ・null を undefined にする", () => {
  assert.equal(trimTo("", 5), undefined);
  assert.equal(trimTo("   \n ", 5), undefined);
  assert.equal(trimTo(null, 5), undefined);
});

test("collapseWs は連続空白を1つにして前後を切る", () => {
  assert.equal(collapseWs("  a \n\t b  "), "a b");
});
