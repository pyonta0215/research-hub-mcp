// stdioトランスポートではstdoutはMCPプロトコル専用。ログは必ずstderrへ。
// RESEARCH_LOG=debug で詳細ログ。

const level = process.env.RESEARCH_LOG ?? "info";

function emit(lv: string, obj: Record<string, unknown>): void {
  if (lv === "debug" && level !== "debug") return;
  process.stderr.write(JSON.stringify({ ts: new Date().toISOString(), lv, ...obj }) + "\n");
}

export const logger = {
  debug: (obj: Record<string, unknown>) => emit("debug", obj),
  info: (obj: Record<string, unknown>) => emit("info", obj),
  warn: (obj: Record<string, unknown>) => emit("warn", obj),
  error: (obj: Record<string, unknown>) => emit("error", obj),
};
