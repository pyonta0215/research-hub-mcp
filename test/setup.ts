// テストはネットワークにもホームディレクトリにも触らない。
// 各モジュールは読み込み時に環境変数を見るため、テストファイルより先に読み込む。
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
process.env.RESEARCH_HUB_CACHE = "off";
process.env.RESEARCH_HUB_FEEDS = path.join(here, "fixtures", "feeds.json");
process.env.GITHUB_TOKEN = "test-token";
