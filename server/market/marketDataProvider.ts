import type {
  MarketCandlesResult,
  MarketCategory,
  MarketQuotesResult,
  MarketQuote,
  MarketSymbolsPage,
} from "./types";

export type GetLastQuoteInput = {
  category: MarketCategory;
  symbol: string;
  precision?: number;
};

export type GetLastQuotesInput = {
  category: MarketCategory;
  symbols: string[];
  precision?: number;
};

export type GetHistoricalOhlcInput = {
  category: MarketCategory;
  symbol: string;
  resolution: string;
  start: number;
  end: number;
};

export type ListSymbolsInput = {
  category: MarketCategory;
  size?: number;
  cursor?: string;
  mode?: string;
  type?: string;
  country?: string;
  /** Case-insensitive substring match on `symbol` or `name` within the returned page only. */
  filter?: string;
};

export interface MarketDataProvider {
  getLastQuote(input: GetLastQuoteInput): Promise<MarketQuote>;
  getLastQuotes(input: GetLastQuotesInput): Promise<MarketQuotesResult>;
  getHistoricalOhlc(input: GetHistoricalOhlcInput): Promise<MarketCandlesResult>;
  listSymbols(input: ListSymbolsInput): Promise<MarketSymbolsPage>;
}
