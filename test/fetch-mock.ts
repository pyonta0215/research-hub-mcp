// globalThis.fetch を URL ごとの応答に差し替える。呼ばれたURLは calls に残る。
type Route = (url: URL) => Response | Promise<Response> | undefined;

export interface FetchMock {
  calls: string[];
  restore(): void;
}

export function mockFetch(route: Route): FetchMock {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url);
    calls.push(url.toString());
    const res = await route(url);
    if (!res) return new Response("not found", { status: 404 });
    return res;
  }) as typeof fetch;
  return { calls, restore: () => void (globalThis.fetch = original) };
}

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const text = (body: string, status = 200): Response => new Response(body, { status });
