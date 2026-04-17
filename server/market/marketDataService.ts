import { ENV } from "../_core/env";
import { createTradeWatchClient } from "../tradewatch/client";
import type { MarketDataProvider } from "./marketDataProvider";
import { TradeWatchMarketProvider } from "./tradewatchMarketProvider";

let cachedProvider: MarketDataProvider | null = null;

/**
 * Returns the configured market data provider (TradeWatch).
 * Call only when `ENV.tradewatchApiKey` is non-empty.
 */
export function getMarketDataProvider(): MarketDataProvider {
  if (!cachedProvider) {
    const client = createTradeWatchClient({
      baseUrl: ENV.tradewatchBaseUrl,
      apiKey: ENV.tradewatchApiKey,
    });
    cachedProvider = new TradeWatchMarketProvider(client);
  }
  return cachedProvider;
}
