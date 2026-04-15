import { callDataApi } from "./_core/dataApi";
import { ENV } from "./_core/env";

export type CryptoSpotRow = {
  symbol: string;
  price: number;
  change24h: number;
  changePct24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  sparkline: number[];
};

function emptySpotRow(key: string): CryptoSpotRow {
  return { symbol: key, price: 0, change24h: 0, changePct24h: 0, high24h: 0, low24h: 0, volume24h: 0, sparkline: [] };
}

let loggedDataGatewayMissing = false;

/** BTC / ETH / SOL spot rows keyed by chain ticker (for Yahoo `BTC-USD` style). */
export async function fetchCryptoSpotPrices(): Promise<Record<string, CryptoSpotRow>> {
  if (!ENV.dataServiceBaseUrl.trim() || !ENV.dataServiceApiKey.trim()) {
    if (!loggedDataGatewayMissing) {
      loggedDataGatewayMissing = true;
      console.warn(
        "[Prices] Data gateway not configured (set AEGIS_DATA_API_URL and AEGIS_DATA_API_KEY). Using zero spot prices until then.",
      );
    }
    return { BTC: emptySpotRow("BTC"), ETH: emptySpotRow("ETH"), SOL: emptySpotRow("SOL") };
  }

  const symbols = [
    { symbol: "BTC-USD", key: "BTC" },
    { symbol: "ETH-USD", key: "ETH" },
    { symbol: "SOL-USD", key: "SOL" },
  ];

  const results: Record<string, CryptoSpotRow> = {};

  for (const { symbol, key } of symbols) {
    try {
      const response = await callDataApi("YahooFinance/get_stock_chart", {
        query: { symbol, interval: "1h", range: "5d" },
      }) as {
        chart?: {
          result?: Array<{
            meta?: {
              regularMarketPrice?: number;
              chartPreviousClose?: number;
              regularMarketDayHigh?: number;
              regularMarketDayLow?: number;
              regularMarketVolume?: number;
            };
            indicators?: { quote?: Array<{ close?: (number | null)[] }> };
          }>;
        };
      };

      const result = response?.chart?.result?.[0];
      const meta = result?.meta;
      const closes = result?.indicators?.quote?.[0]?.close ?? [];
      const sparkline = closes
        .filter((v): v is number => v !== null && v !== undefined)
        .slice(-24);

      const price = meta?.regularMarketPrice ?? 0;
      const prevClose = meta?.chartPreviousClose ?? price;
      const change24h = price - prevClose;
      const changePct24h = prevClose !== 0 ? (change24h / prevClose) * 100 : 0;

      results[key] = {
        symbol: key,
        price,
        change24h,
        changePct24h,
        high24h: meta?.regularMarketDayHigh ?? price,
        low24h: meta?.regularMarketDayLow ?? price,
        volume24h: meta?.regularMarketVolume ?? 0,
        sparkline,
      };
    } catch (err) {
      console.error(`[Prices] Failed to fetch ${symbol}:`, err);
      results[key] = { symbol: key, price: 0, change24h: 0, changePct24h: 0, high24h: 0, low24h: 0, volume24h: 0, sparkline: [] };
    }
  }

  return results;
}

/** Minimal spot map for background jobs (total USD only). */
export async function fetchCryptoSpotPriceMap(): Promise<Record<string, number>> {
  const rows = await fetchCryptoSpotPrices();
  return {
    BTC: rows.BTC?.price ?? 0,
    ETH: rows.ETH?.price ?? 0,
    SOL: rows.SOL?.price ?? 0,
  };
}
