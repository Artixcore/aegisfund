export class TradeWatchHttpError extends Error {
  readonly name = "TradeWatchHttpError";

  constructor(
    readonly status: number,
    message: string,
    readonly path: string,
    readonly responseBody?: string,
  ) {
    super(message);
  }
}

export type TradeWatchClientOptions = {
  baseUrl: string;
  apiKey: string;
};

function joinBaseAndPath(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

export type TradeWatchClient = {
  getJson<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T>;
};

export function createTradeWatchClient(options: TradeWatchClientOptions): TradeWatchClient {
  const { baseUrl, apiKey } = options;

  return {
    async getJson<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
      const url = new URL(joinBaseAndPath(baseUrl, path));
      if (query) {
        for (const [k, v] of Object.entries(query)) {
          if (v === undefined || v === "") continue;
          url.searchParams.set(k, String(v));
        }
      }

      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          accept: "application/json",
          "api-key": apiKey,
        },
      });

      const text = await res.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = text;
      }

      if (!res.ok) {
        const snippet =
          typeof body === "object" && body !== null
            ? JSON.stringify(body).slice(0, 500)
            : String(text).slice(0, 500);
        console.error(`[TradeWatch] ${res.status} ${path}: ${snippet}`);
        throw new TradeWatchHttpError(
          res.status,
          `TradeWatch request failed (${res.status})`,
          path,
          snippet,
        );
      }

      return body as T;
    },
  };
}
