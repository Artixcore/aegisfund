import type { FinnhubClient } from "../finnhub/client";
import type {
  GetHistoricalOhlcInput,
  GetLastQuoteInput,
  GetLastQuotesInput,
  ListSymbolsInput,
  MarketDataProvider,
} from "./marketDataProvider";
import { finnhubResolutionFromSeconds, resolveFinnhubSymbol } from "./finnhubSymbol";
import {
  normalizeFinnhubCandles,
  normalizeFinnhubQuote,
  normalizeFinnhubSearchResults,
  normalizeQuotesFromItems,
  normalizeSymbolListPage,
  type FinnhubCandleResponse,
  type FinnhubQuoteResponse,
} from "./normalize";
async function mapPool<T, R>(items: T[], concurrency: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    out.push(...(await Promise.all(chunk.map(fn))));
  }
  return out;
}

export class FinnhubMarketProvider implements MarketDataProvider {
  constructor(private readonly client: FinnhubClient) {}

  async getLastQuote(input: GetLastQuoteInput) {
    const { category, symbol } = input;
    const { finnhub } = resolveFinnhubSymbol(category, symbol);
    const q = await this.client.getJson<FinnhubQuoteResponse>("/quote", { symbol: finnhub });
    return normalizeFinnhubQuote(category, symbol, q);
  }

  async getLastQuotes(input: GetLastQuotesInput) {
    const { category, symbols } = input;
    const items = await mapPool(symbols, 6, async (sym) => {
      const { finnhub } = resolveFinnhubSymbol(category, sym);
      const q = await this.client.getJson<FinnhubQuoteResponse>("/quote", { symbol: finnhub });
      return normalizeFinnhubQuote(category, sym, q);
    });
    return normalizeQuotesFromItems(category, items);
  }

  async getHistoricalOhlc(input: GetHistoricalOhlcInput) {
    const { category, symbol, resolution, start, end } = input;
    const { finnhub, candleKind } = resolveFinnhubSymbol(category, symbol);
    const fhResToken = finnhubResolutionFromSeconds(resolution);

    let path: string;
    const q: Record<string, string | number> = {
      symbol: finnhub,
      resolution: fhResToken,
      from: start,
      to: end,
    };
    if (candleKind === "stock") {
      path = "/stock/candle";
    } else if (candleKind === "forex") {
      path = "/forex/candle";
    } else {
      path = "/crypto/candle";
    }

    const body = await this.client.getJson<FinnhubCandleResponse>(path, q);
    return normalizeFinnhubCandles(category, symbol, resolution, body, fhResToken);
  }

  async listSymbols(input: ListSymbolsInput) {
    const { category, size = 50, cursor, filter } = input;
    const offset = Math.max(0, parseInt(cursor ?? "0", 10) || 0);
    const pageSize = Math.min(500, Math.max(1, size));

    if (filter?.trim()) {
      const search = await this.client.getJson<{
        result?: Array<{ symbol?: string; description?: string; displaySymbol?: string }>;
      }>("/search", { q: filter.trim() });
      const limited = search.result?.slice(0, pageSize) ?? [];
      return normalizeFinnhubSearchResults(limited, undefined);
    }

    if (category === "stocks" || category === "indices" || category === "commodities") {
      const exchange = input.country?.trim() || "US";
      const raw = await this.client.getJson<Array<{ symbol?: string; description?: string; displaySymbol?: string }>>(
        "/stock/symbol",
        { exchange },
      );
      return normalizeSymbolListPage(raw ?? [], offset, pageSize, undefined);
    }

    if (category === "currencies") {
      const raw = await this.client.getJson<Array<{ symbol?: string; description?: string; displaySymbol?: string }>>(
        "/forex/symbol",
        { exchange: "OANDA" },
      );
      return normalizeSymbolListPage(raw ?? [], offset, pageSize, undefined);
    }

    const raw = await this.client.getJson<Array<{ symbol?: string; description?: string; displaySymbol?: string }>>(
      "/crypto/symbol",
      { exchange: "BINANCE" },
    );
    return normalizeSymbolListPage(raw ?? [], offset, pageSize, undefined);
  }
}
