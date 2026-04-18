import { z } from "zod";
import {
  BROKER_ASSET_CLASSES,
  BROKER_VENUE_BY_CLASS,
  type BrokerAssetClass,
} from "@shared/brokerVenues";

export { BROKER_ASSET_CLASSES, BROKER_VENUE_BY_CLASS, type BrokerAssetClass };

export const brokerCredentialPayloadSchema = z.object({
  apiKey: z.string().min(1).max(4096),
  apiSecret: z.string().max(4096).optional(),
  passphrase: z.string().max(512).optional(),
  baseUrlOverride: z
    .union([z.string().url().max(512), z.literal("")])
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export type BrokerCredentialPayload = z.infer<typeof brokerCredentialPayloadSchema>;

export const saveBrokerConnectionInputSchema = z
  .object({
    id: z.number().int().positive().optional(),
    assetClass: z.enum(BROKER_ASSET_CLASSES),
    venue: z.string().min(1).max(64),
    label: z.string().max(128).optional(),
    environment: z.enum(["paper", "live"]),
    credentials: brokerCredentialPayloadSchema,
  })
  .refine(
    (d) =>
      d.venue === "custom" ||
      (BROKER_VENUE_BY_CLASS[d.assetClass] as readonly string[]).includes(d.venue),
    { message: "Invalid venue for this asset class (use a listed venue or custom)" },
  );

export type SaveBrokerConnectionInput = z.infer<typeof saveBrokerConnectionInputSchema>;

export function keyHintFromApiKey(apiKey: string): string | null {
  const t = apiKey.trim();
  if (!t) return null;
  if (t.length <= 4) return "****";
  return `…${t.slice(-4)}`;
}

export type ExecutionMode = "backtest" | "paper" | "live";

/** For paper/live, true means at least one connection exists for that asset+environment. Backtest: all true (no broker required). */
export function brokerCoverageForMode(
  mode: ExecutionMode,
  connections: Array<{ assetClass: string; environment: string }>,
): Record<BrokerAssetClass, boolean> {
  const classes: BrokerAssetClass[] = ["stock", "forex", "crypto", "commodity"];
  if (mode === "backtest") {
    return Object.fromEntries(classes.map((c) => [c, true])) as Record<BrokerAssetClass, boolean>;
  }
  const env = mode === "live" ? "live" : "paper";
  return Object.fromEntries(
    classes.map((c) => [
      c,
      connections.some((x) => x.assetClass === c && x.environment === env),
    ]),
  ) as Record<BrokerAssetClass, boolean>;
}
