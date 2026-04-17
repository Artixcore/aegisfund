import type {
  MarketCandle,
  MarketCandlesResult,
  MarketCategory,
  MarketQuote,
  MarketQuotesResult,
  MarketSymbolRow,
  MarketSymbolsPage,
} from "./types";

/** Finnhub /quote response (subset). */
export type FinnhubQuoteResponse = {
  c?: number;
  h?: number;
  l?: number;
  o?: number;
  pc?: number;
  t?: number;
};

/** Finnhub candle response when s === "ok". */
export type FinnhubCandleResponse = {
  s: string;
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
};

export function normalizeFinnhubQuote(
  category: MarketCategory,
  logicalSymbol: string,
  q: FinnhubQuoteResponse,
): MarketQuote {
  const mid = q.c ?? 0;
  const ts = q.t != null && q.t > 0 ? q.t : Math.floor(Date.now() / 1000);
  return {
    category,
    symbol: logicalSymbol,
    timestamp: ts,
    bid: mid,
    ask: mid,
    mid,
    source: "finnhub",
  };
}

export function normalizeQuotesFromItems(category: MarketCategory, items: MarketQuote[]): MarketQuotesResult {
  return { items };
}

export function normalizeFinnhubCandles(
  category: MarketCategory,
  logicalSymbol: string,
  resolutionInput: string,
  fhRes: FinnhubCandleResponse,
  _finnhubResolution: string,
): MarketCandlesResult {
  const candles: MarketCandle[] = [];
  if (fhRes.s === "ok" && fhRes.t && fhRes.o && fhRes.h && fhRes.l && fhRes.c) {
    const n = fhRes.t.length;
    for (let i = 0; i < n; i++) {
      candles.push({
        time: fhRes.t[i]!,
        open: fhRes.o[i]!,
        high: fhRes.h[i]!,
        low: fhRes.l[i]!,
        close: fhRes.c[i]!,
      });
    }
  }
  return {
    category,
    symbol: logicalSymbol,
    resolution: resolutionInput,
    candles,
  };
}

export function normalizeFinnhubSearchResults(
  result: Array<{ symbol?: string; description?: string; displaySymbol?: string }> | undefined,
  filter?: string,
): MarketSymbolsPage {
  let items: MarketSymbolRow[] = (result ?? []).map((r) => ({
    symbol: r.displaySymbol ?? r.symbol ?? "",
    name: r.description ?? r.symbol ?? "",
  }));
  if (filter?.trim()) {
    const f = filter.trim().toLowerCase();
    items = items.filter(
      (r) => r.symbol.toLowerCase().includes(f) || r.name.toLowerCase().includes(f),
    );
  }
  return {
    items,
    cursor: { next: null, previous: null },
    total: items.length,
  };
}

export function normalizeSymbolListPage(
  rows: Array<{ symbol?: string; description?: string; displaySymbol?: string }>,
  offset: number,
  size: number,
  filter?: string,
): MarketSymbolsPage {
  let items: MarketSymbolRow[] = rows.map((r) => ({
    symbol: r.displaySymbol ?? r.symbol ?? "",
    name: r.description ?? r.symbol ?? "",
  }));
  if (filter?.trim()) {
    const f = filter.trim().toLowerCase();
    items = items.filter(
      (r) => r.symbol.toLowerCase().includes(f) || r.name.toLowerCase().includes(f),
    );
  }
  const total = items.length;
  const slice = items.slice(offset, offset + size);
  const nextOffset = offset + size < total ? String(offset + size) : null;
  const prevOffset = offset > 0 ? String(Math.max(0, offset - size)) : null;
  return {
    items: slice,
    cursor: {
      next: nextOffset,
      previous: prevOffset,
    },
    total,
  };
}
