/** Shared venue slugs for broker BYOK UI and server validation. */

export const BROKER_ASSET_CLASSES = ["stock", "forex", "crypto", "commodity"] as const;
export type BrokerAssetClass = (typeof BROKER_ASSET_CLASSES)[number];

export const BROKER_VENUE_BY_CLASS: Record<BrokerAssetClass, readonly string[]> = {
  stock: ["alpaca", "custom"],
  forex: ["oanda", "custom"],
  crypto: ["binance", "coinbase", "custom"],
  commodity: ["interactive_brokers", "custom"],
};

export const ASSET_CLASS_LABELS: Record<BrokerAssetClass, string> = {
  stock: "Stocks",
  forex: "Forex",
  crypto: "Crypto",
  commodity: "Commodities",
};
