import { ENV } from "../_core/env";
import { createFinnhubClient } from "../finnhub/client";
import type { MarketDataProvider } from "./marketDataProvider";
import { FinnhubMarketProvider } from "./finnhubMarketProvider";

let cachedProvider: MarketDataProvider | null = null;

/**
 * Returns the configured market data provider (Finnhub).
 * Call only when `ENV.finnhubApiKey` is non-empty.
 */
export function getMarketDataProvider(): MarketDataProvider {
  if (!cachedProvider) {
    const client = createFinnhubClient({
      baseUrl: ENV.finnhubBaseUrl,
      apiKey: ENV.finnhubApiKey,
    });
    cachedProvider = new FinnhubMarketProvider(client);
  }
  return cachedProvider;
}
