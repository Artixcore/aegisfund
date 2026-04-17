export const MARKET_CATEGORIES = [
  "currencies",
  "crypto",
  "indices",
  "stocks",
  "commodities",
] as const;

export type MarketCategory = (typeof MARKET_CATEGORIES)[number];

export type MarketQuote = {
  category: MarketCategory;
  symbol: string;
  timestamp: number;
  bid: number;
  ask: number;
  mid: number;
  source: "finnhub";
};

export type MarketQuotesResult = {
  items: MarketQuote[];
};

export type MarketCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type MarketCandlesResult = {
  category: MarketCategory;
  symbol: string;
  resolution: string;
  candles: MarketCandle[];
};

export type MarketSymbolRow = {
  symbol: string;
  name: string;
};

export type MarketSymbolsPage = {
  items: MarketSymbolRow[];
  cursor: {
    next: string | null;
    previous: string | null;
  };
  total: number | null;
};

export type MarketCategoryInfo = {
  id: MarketCategory;
  label: string;
  description: string;
};

export const MARKET_CATEGORY_INFO: MarketCategoryInfo[] = [
  {
    id: "currencies",
    label: "Currencies",
    description: "Forex pairs and global exchange rates.",
  },
  {
    id: "crypto",
    label: "Cryptocurrencies",
    description: "Digital asset spot quotes and history.",
  },
  {
    id: "indices",
    label: "Indices",
    description: "Major market indices and benchmarks.",
  },
  {
    id: "stocks",
    label: "Stocks",
    description: "Global equities and related market data.",
  },
  {
    id: "commodities",
    label: "Commodities",
    description: "Metals, energy, agricultural, and other commodities.",
  },
];
