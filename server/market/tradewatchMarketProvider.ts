import type { TradeWatchClient } from "../tradewatch/client";
import type {
  GetHistoricalOhlcInput,
  GetLastQuoteInput,
  GetLastQuotesInput,
  ListSymbolsInput,
  MarketDataProvider,
} from "./marketDataProvider";
import { normalizeOhlc, normalizeQuote, normalizeQuotes, normalizeSymbolsPage } from "./normalize";

export class TradeWatchMarketProvider implements MarketDataProvider {
  constructor(private readonly client: TradeWatchClient) {}

  async getLastQuote(input: GetLastQuoteInput) {
    const { category, symbol, precision } = input;
    const row = await this.client.getJson<{
      symbol: string;
      ask: number;
      bid: number;
      mid: number;
      timestamp: number;
    }>(`/${category}/quote`, { symbol, precision });
    return normalizeQuote(category, row);
  }

  async getLastQuotes(input: GetLastQuotesInput) {
    const { category, symbols, precision } = input;
    const symbolsParam = symbols.join(",");
    const body = await this.client.getJson<{
      items: Array<{ symbol: string; ask: number; bid: number; mid: number; timestamp: number }>;
    }>(`/${category}/quotes`, { symbols: symbolsParam, precision });
    return normalizeQuotes(category, body);
  }

  async getHistoricalOhlc(input: GetHistoricalOhlcInput) {
    const { category, symbol, resolution, start, end } = input;
    const path = `/${category}/${encodeURIComponent(symbol)}/ohlc`;
    const body = await this.client.getJson<{
      symbol: string;
      resolution: string;
      items: Array<{
        time: number;
        open_ask: number;
        high_ask: number;
        low_ask: number;
        close_ask: number;
        open_bid: number;
        high_bid: number;
        low_bid: number;
        close_bid: number;
      }>;
    }>(path, { resolution, start, end });
    return normalizeOhlc(category, symbol, body);
  }

  async listSymbols(input: ListSymbolsInput) {
    const { category, size, cursor, mode, type, country, filter } = input;
    const body = await this.client.getJson<{
      items: Array<{ symbol: string; name: string }>;
      total?: number | null;
      next_page?: string | null;
      previous_page?: string | null;
    }>(`/${category}/symbols`, { size, cursor, mode, type, country });
    return normalizeSymbolsPage(body, filter);
  }
}
