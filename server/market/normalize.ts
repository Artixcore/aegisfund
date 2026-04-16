import type {
  MarketCandle,
  MarketCandlesResult,
  MarketCategory,
  MarketQuote,
  MarketQuotesResult,
  MarketSymbolRow,
  MarketSymbolsPage,
} from "./types";

type TwLastQuote = {
  symbol: string;
  ask: number;
  bid: number;
  mid: number;
  timestamp: number;
};

type TwLastQuotesBody = {
  items: TwLastQuote[];
};

type TwOhlcCandle = {
  time: number;
  open_ask: number;
  high_ask: number;
  low_ask: number;
  close_ask: number;
  open_bid: number;
  high_bid: number;
  low_bid: number;
  close_bid: number;
};

type TwOhlcBody = {
  symbol: string;
  resolution: string;
  items: TwOhlcCandle[];
};

type TwSymbolRow = {
  symbol: string;
  name: string;
};

type TwSymbolsPageBody = {
  items: TwSymbolRow[];
  total?: number | null;
  next_page?: string | null;
  previous_page?: string | null;
};

function mid(a: number, b: number): number {
  return (a + b) / 2;
}

export function normalizeQuote(category: MarketCategory, row: TwLastQuote): MarketQuote {
  return {
    category,
    symbol: row.symbol,
    timestamp: row.timestamp,
    bid: row.bid,
    ask: row.ask,
    mid: row.mid,
    source: "tradewatch",
  };
}

export function normalizeQuotes(category: MarketCategory, body: TwLastQuotesBody): MarketQuotesResult {
  const items = (body.items ?? []).map((row) => normalizeQuote(category, row));
  return { items };
}

export function normalizeOhlc(
  category: MarketCategory,
  symbol: string,
  body: TwOhlcBody,
): MarketCandlesResult {
  const candles: MarketCandle[] = (body.items ?? []).map((c) => ({
    time: c.time,
    open: mid(c.open_bid, c.open_ask),
    high: mid(c.high_bid, c.high_ask),
    low: mid(c.low_bid, c.low_ask),
    close: mid(c.close_bid, c.close_ask),
  }));
  return {
    category,
    symbol: body.symbol || symbol,
    resolution: body.resolution,
    candles,
  };
}

export function normalizeSymbolsPage(body: TwSymbolsPageBody, filter?: string): MarketSymbolsPage {
  let items: MarketSymbolRow[] = (body.items ?? []).map((r) => ({
    symbol: r.symbol,
    name: r.name,
  }));
  if (filter?.trim()) {
    const f = filter.trim().toLowerCase();
    items = items.filter(
      (r) => r.symbol.toLowerCase().includes(f) || r.name.toLowerCase().includes(f),
    );
  }
  return {
    items,
    cursor: {
      next: body.next_page ?? null,
      previous: body.previous_page ?? null,
    },
    total: body.total ?? null,
  };
}
